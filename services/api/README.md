# services/api —— FastAPI 后端

**负责人：C**　**状态：🟡 本地可跑。未接 PostgreSQL / Redis，未做容器，未部署到华为云。**

验证边界跟仓库其余部分一样：**软件在环仿真（SITL）都还没接，这里更没有实飞。**
场景几何是 `scenarios/v0` 草稿，GeoJSON 自己标着 `is_simulated=true`、`status=draft`。

## 这个进程做什么

接收任务、读场景、调用规划器、把路线存下来。它不控制姿态，不生成电机指令，
也不在规划器没给数据时编造能耗或备降余量。

领域对象只用 `core/models.py` 里的 `Task`、`RiskSnapshot`、`RoutePlan`、
`DiversionMarginProfile`、`LandingSite`、`Position`。
`services/api/envelopes.py` 里的模型是 HTTP 信封（这次有没有拿到 RoutePlan、
余量算出来没有），不是第二套航线契约。

## 启动

```bash
python -m venv .venv
source .venv/bin/activate          # Windows：.venv\Scripts\activate
pip install -r requirements.txt

python -m services.api             # 127.0.0.1:8000
# 或者
uvicorn services.api.main:create_app --factory --host 127.0.0.1 --port 8000
```

默认把任务写到 `data/api.sqlite`（已 gitignore）。关掉进程再开，任务还在。
想要关掉就丢的存储：

```bash
STORAGE_BACKEND=memory python -m services.api
```

`memory` 是进程内的 SQLite `:memory:`，不是 Redis。环境变量样例在仓库根 `.env.example`。
复制成 `.env` 再填；`.env` 不会进仓库。本服务启动时会读它，且不覆盖已经存在的环境变量。

健康检查：

```bash
curl -s http://127.0.0.1:8000/health
```

`postgres.connected` 和 `redis.connected` 在这一版永远是 `false`。
`RDS_DSN`、`DATABASE_URL`、`DCS_HOST`、`REDIS_URL` 只是配置位：填了会显示 `configured=true`，
响应里不回显连接串。

交互式文档在 `/docs`。下面的表是契约，以它为准。

## 接口

| 方法 | 路径 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| GET | `/health` | — | 信封 | 契约版本、git commit、存储、规划入口、云配置位、M3 是否配置 |
| POST | `/tasks` | `Task` | `Task` | 201。重复 `task_id` 返回 409 |
| GET | `/tasks` | — | `Task[]` | 按创建顺序 |
| GET | `/tasks/{task_id}` | — | `Task` | 没有则 404 |
| GET | `/scenes/{scene_id}` | — | 场景信封 | 目前只有 `v0`。障碍和限制区是 GeoJSON 原文，备降点是 `LandingSite` |
| POST | `/tasks/{task_id}/snapshots` | `RiskSnapshot` | `RiskSnapshot` | 直接存调用方给的快照。时间必须带时区 |
| POST | `/tasks/{task_id}/snapshots/from-scene` | `{scene_id, active_zone_ids, occupied_site_ids}` | `{snapshot, ...}` | 用 v0 草稿生成快照。不点名的限制区不会变成“已经生效” |
| GET | `/tasks/{task_id}/snapshot` | — | `RiskSnapshot` | 最近一张 |
| GET | `/tasks/{task_id}/snapshots/{snapshot_id}` | — | `RiskSnapshot` | |
| POST | `/tasks/{task_id}/plan` | `{snapshot_id?, algorithm?}` | `{route, agent}` | 调规划器。`snapshot_id` 省略则用最近一张 |
| GET | `/tasks/{task_id}/routes` | — | 路线信封[] | |
| GET | `/tasks/{task_id}/routes/{route_id}` | — | 路线信封 | `route_id` 是 `v1`、`v2`… |
| GET | `/tasks/{task_id}/routes/{route_id}/margin` | — | 余量信封 | 有剖面才填数字；否则 `status=unavailable` 且 `profile=null` |

创建一条最小任务（坐标是测试值，不是机型参数）：

```bash
curl -s -X POST http://127.0.0.1:8000/tasks \
  -H 'content-type: application/json' \
  -d '{
    "task_id": "T-20261109-001",
    "origin": {"frame": "enu_m", "x_m": 150, "y_m": 150, "alt_m": 0, "alt_ref": "rel_takeoff"},
    "destination": {"frame": "enu_m", "x_m": 2650, "y_m": 2750, "alt_m": 30, "alt_ref": "rel_takeoff"},
    "payload_kg": 1,
    "vehicle_type": "placeholder",
    "initial_energy_wh": 100,
    "reserve_energy_wh": 20,
    "provenance": {
      "source": "demo",
      "version": "0",
      "captured_at": "2026-11-09T00:00:00+00:00",
      "is_simulated": true
    }
  }'
```

然后：

```bash
curl -s -X POST http://127.0.0.1:8000/tasks/T-20261109-001/snapshots/from-scene \
  -H 'content-type: application/json' \
  -d '{"scene_id":"v0","active_zone_ids":[]}'

curl -s -X POST http://127.0.0.1:8000/tasks/T-20261109-001/plan \
  -H 'content-type: application/json' \
  -d '{}'
```

`initial_energy_wh: 100` 是调用方写在任务单上的数。当前规划器不算能耗，
接口**不会**把它抄进 `energy_budget_wh`。

## 规划结果怎么读

当前默认入口是 `planner.astar:plan_scenario`（`astar_static`）。它只做几何可达：
避开建筑，以及快照里**已经生效**且带了区号的限制区。不判时限，不算能量，不做备降剪枝。

因此现在一次成功的规划是：

- `found=true` 时，`waypoints` 是平面航点，长度与直接调用 `plan_scenario` 一致。
- 端点沿用任务单上的 `Position`。中间点只有 A* 的平面坐标，`alt_m` 复制起点，
  仅为满足 `Position` 必填。`altitude_note` 写了这句话。这不是高度剖面。
- `route` 为 `null`，`route_plan_status=unavailable`。
  原因是组不成合法的 `RoutePlan`：缺 `energy_budget_wh`，而机型参数仍是 null，
  能量模型会拒绝计算。这里不填 0，也不另写一个能耗。
- `margin_status=unavailable`，`margin_detail` 以“未实现”开头，`margin_profile=null`。
  查询余量时 `min_margin_wh`、`negative_sample_count`、`is_feasible` 都是 null。
  空剖面的 `is_feasible` 会是 false，那表示“算过但不行”，所以不能拿来表示“还没算”。
- `is_simulated=true`。场景是草稿仿真。就算任务单把 `is_simulated` 写成 false，路线记录仍标仿真。
- `elapsed_ms` 只是这次搜索函数自己的耗时，不是端到端时延。
- `algorithm` 想写成 `astar_diversion` 也不会换成另一个算法。响应里会说明请求名未生效。

限制区的区号放在 `geometry.zone_id` 或 `geometry.properties.id`。
没有区号的多边形，当前入口不会拿去封控，响应的 `limitations` 会写明。
`effective_from` 还在未来的限制区不会被提前当成障碍；基线也不会做时间轴绕行，同样写在 `limitations`。
快照过了 `valid_until` 会 409，并且不会存一条路线。
经纬度任务直接 422，本服务不做坐标转换。

## 和 M2 怎么接

路由不直接 import `planner.astar`。唯一调用点是 `services/api/planner_adapter.py`。

```bash
PLANNER_ENTRY=模块:函数
```

留空则使用 `planner.astar:plan_scenario`。函数签名里出现这些名字就会被填上：
`task`、`snapshot`、`scenario`、`scene`。其余必填参数对不上时，接口 500，并说明缺什么，不猜。

返回值可以是：

- `PathResult`，或 `(PathResult, 栅格)`：当前基线就是这样。只有平面航点。
- `RoutePlan`：原样放进 `route`，不改航点和 `energy_budget_wh`。
- 带 `route` / `route_plan` 以及 `margin_profile`（或 `margin` / `diversion_margin`）属性的对象。
  剖面原样返回，采样点不改。

`planner/diversion.py` 已经在仓库里。本进程的默认入口仍是 `planner.astar:plan_scenario`，没有把 `PLANNER_ENTRY` 指到备降规划器。
所以现在查余量仍然是“未实现”。以后若把入口改过去，并且那个函数返回 `RoutePlan` 和 `DiversionMarginProfile`，查询路径不用改。
在改入口之前，不要把 HTTP 响应写成已经有剖面。

## 和 M3 怎么接

M3（任务 Agent 与云边决策）不在本服务里。这里没有 `agent/` 或 `m3/` 目录，
没有状态机，没有模型调用，也不会根据工具结果决定下一步。

预留的调用点只有一个：`services.api.agent_hook.invoke_task_agent`。
规划函数返回之后（包括“没有可行路线”）会调用它，传入：

```text
event=plan_completed, task_id, snapshot_id, route_id, found, algorithm
```

默认返回 `status=not_implemented`，`applied=false`。
另一组员把函数准备好以后：

```bash
AGENT_ENTRY=他们的模块:函数
```

本服务会调用该函数，然后**丢掉返回值**：不改路线、不改任务、不改快照，也不把文本当成校验结论。
调用失败时规划结果仍然返回，`agent.status=error`。
过期快照、缺快照、坐标系不对这些在进规划器之前就拒绝，不会去叫 M3。

`/health` 只说明入口有没有配置，不回显模块路径。规划响应里的 `agent.entry` 会写出路径，
所以不要把密钥放进 `AGENT_ENTRY`。

## 测试

```bash
python -m pytest
```

API 用例在 `tests/test_api.py`，用 FastAPI `TestClient`，存储用内存库，不读 `.env`。
其中一条会把桩规划器配到 `PLANNER_ENTRY` 上，确认 `RoutePlan` 和余量剖面被原样转发；
桩里的 `12.5` Wh 只存在于测试文件，服务代码里没有这个数。

## 这一版明确没有的

- 独立校验器。没有 `/verify`，也不会在 `checks` 里写一条 `passed=true`。
- 飞控下发、`PlanCommand` / `PlanAck`、遥测、回放导出。
- 备降余量的真实采样。接口在，数据没有。
- PostgreSQL、Redis、OBS、MQTT、华为云部署。`ops/docker-compose.yml` 里的 `cloud-api` 仍是注释，没有镜像。
- 把 `eval/planners.py` 的 mock 数字接到 HTTP 上。那些数不能出现在效果描述里。
