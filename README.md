# lowalt-dispatch

面向**应急配送**的低空航线规划系统。核心机制只有一条：把"备降可达性"做成**规划搜索阶段的硬约束**（每个候选状态都必须还能落到一个当前有效的降落点，否则直接剪枝），而不是选完最短路线之后再弹一次告警。配套的是云端链路退化时，边缘端按已同步、仍有效的快照执行**预校验过的**备用方案。

> **验证边界：软件在环仿真（SITL），无实机飞行。**
> 本仓库目前**没有**真实飞行数据、**没有**真实机型参数、**没有**云部署。
> 能量和备降余量如果来自 `example_not_real.yaml`，那是**示例参数，非真实平台数据**。

## 现在是什么状态

v0.1 —— 骨架 + 几何基线 + 备降硬约束的第一版搜索。仍无实飞、无真实机型参数。

已经有的：

- `core/models.py` —— 五类接口的数据契约（Task / RiskSnapshot / RoutePlan / VehicleState / 执行确认），带单位、高度基准和"是否仿真"的硬校验
- `core/geometry.py` —— 几何原语（只做数学，不做判定）
- `planner/astar.py` —— 栅格化 + A\* **几何基线**。不看能量、不看备降、不看时限
- `planner/diversion.py` —— 备降余量，以及把备降可达性放进 A\* 扩展的硬约束。不够就剪枝；无解就说明原因，不交一条负余量的路线
- `sim/energy.py` —— 能量模型；**机型参数不填就直接报错**。`placeholder.yaml` 仍全是 null
- `scenarios/vehicles/example_not_real.yaml` —— 手写示例参数，文件头写明**不是真实平台数据**。只为把上面这条链路跑通
- `eval/` —— 评测 harness。`astar_static` 与 `astar_diversion` 是真算法；`astar_dynamic` 仍是 mock，输出继续带 `_MOCK`
- `services/api/` —— FastAPI：任务、v0 场景、默认调用几何基线。余量 URL 在；入口还没切到备降规划器，所以剖面返回未实现
- `tests/` —— 契约、基线、剪枝、无解、余量公式，以及 API 的 TestClient。当前全量见事实文档 3.7

**没有的**：另一人实现的独立校验器、动态重规划（`astar_dynamic` 仍是 mock）、风场、飞控连接、云端部署、前端页面、真实机型参数。
备降路径是栅格八邻域近似，不是连续轨迹。准确进度只看 [`事实文档.md`](事实文档.md)。

## 文档

- [`docs/接口契约.md`](docs/接口契约.md) — 单位、对象字段和目标动作。和代码不一致时以 `core/models.py` 为准。
- [`docs/功能树与实现逻辑.md`](docs/功能树与实现逻辑.md) — 功能树。每条都标了已实现、未实现、仅规划或已知问题，并标出上游有、本 fork 还没同步的部分。
- [`docs/关键接口文档.md`](docs/关键接口文档.md) — 当前 FastAPI 路由，以及上游未同步的 Python 接口。

## 快速开始

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # Windows
# source .venv/bin/activate && pip install -r requirements.txt  # Linux/macOS

# A* 几何基线（不看备降）
python -m planner.astar

# 基线 vs 带约束 A*，终端对照。默认就是示例机型，第一行会标明
python -m planner.diversion

# 评测：真算法对照，CSV + meta + 余量剖面。必须显式传入示例机型
python -m eval.run --suite eval/scenarios/v0.yaml --seeds 1,2,3 \
    --algorithms astar_static,astar_diversion \
    --vehicle scenarios/vehicles/example_not_real.yaml \
    --out results/example_vehicle_compare.csv

# 仍是 mock 的动态基线。输出文件名自动带 _MOCK，数字不能当结果
python -m eval.run --suite eval/scenarios/v0.yaml --seeds 1,2,3 \
    --algorithms astar_dynamic --out results/v0.csv

# 跑测试
python -m pytest
```

Windows 把 `python` 换成 `.venv/Scripts/python`。

真算法这条命令的预期形态（数字以当次 meta 为准，下面只说明文件，不把示例能耗写成结论）：

```
示例参数，非真实平台数据
场景 20 × 种子 3 × 算法 2 = 120 行
CSV      → results/example_vehicle_compare.csv
meta     → results/example_vehicle_compare.meta.json
profiles → results/example_vehicle_compare.profiles.json
```

`astar_static` 和 `astar_diversion` 不随种子变化，三颗种子是同一条航线抄三遍。
`profiles.json` 里是沿航线的备降余量采样，给以后画剖面；`margin_wh = -1e6` 是“没有可达备降点”的哨兵，不是能量缺口。

mock 文件名里的 `_MOCK` 仍是自动加的。同一次命令里如果混进 `astar_dynamic`，mock 行进 `_MOCK` 文件，真算法行留在你指定的路径里，不会搅在一起。

## 目录

```
core/            数据契约 + 几何原语（A/B/C 共用，改这里必须同步 docs/接口契约.md）
planner/         栅格 + A* 基线 + 备降硬约束（M2）
sim/             能量模型（M2）—— 机型参数不填就报错
eval/            评测 harness + 场景集
  scenarios/     20 个任务样例（v0.yaml）
scenarios/v0/    草稿几何：建筑 / 限制区 / 备降点 —— 待 B 复核或重画
  vehicles/      placeholder.yaml 仍全是 null；example_not_real.yaml 是示例参数
services/api/    FastAPI 后端（任务 / 场景 / 规划；默认仍是几何基线，余量接口在、剖面还没从规划器接到 HTTP）
edge/            边缘 agent（云边断连时兜底）—— 未开始
apps/web/        React + MapLibre 任务台 —— 未开始
ops/             Compose 拓扑（含断连演示用的双网络）
docs/            接口契约、功能树、关键接口
results/         评测产物；真实结果在冻结时提交，mock 永不入库
```

## 三个人从哪进

| 角色 | 第一件事 | 卡点 |
|---|---|---|
| A · 飞控与仿真 | PX4 SITL 起得来、读到位置/状态 | 填 `scenarios/vehicles/placeholder.yaml` 的 `null`——**它卡着所有能量计算** |
| B · 规划与数据 | 复核 `scenarios/v0/` 草稿几何；示例参数下的余量还不是标定结果 | 真实机型参数（来自 A），以及独立校验器 |
| C · 平台与智能体 | ECS 最小部署 + SWR 镜像预检；FastAPI 骨架 | 云账号与安全组 |

## 表述红线

这些词在本仓库和一切材料里都不许乱用，理由见 [`事实文档.md`](事实文档.md) 第 5 节：

- 仿真 → 不能说成实飞
- 本地备用方案切换 → 不能说成边缘实时重规划
- 固定顺序调用工具 → 不能说成 Agent 自主决策
- mock 数字 → 不能出现在任何效果描述里
- 示例机型参数下的余量 / 可行场景数 → 不能说成实机能耗或已标定的任务完成率
