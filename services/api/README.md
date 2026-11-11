# 本地任务服务

已经实现 `runtime.py` + `routes.py`，挂载在 `services.assistant.app:app`；共用一个8012端口，无需另开API服务或购买云资源。

## 最快运行

在仓库根目录安装 `services/assistant/requirements.txt`，进入 `apps/console` 执行 `npm.cmd run dev:all`，打开 <http://127.0.0.1:5174/>，点击顶部「本地任务联调」。

1. 选择 `S1-01`，点击「生成待审任务」。
2. 检查起终点ENU、高度基准、合成初始/预留能量，勾选确认后运行。
3. 查看真实M3/M2/独立校验代码产生的受理状态、航点数、ACK、版本、启动次数与工具审计。
4. 后台每0.5秒推进FakeExecutor；ACK后仍是 `executing`，结束后才报告 `completed`。
5. 可以明确「结束本次合成测试」，释放本地车辆，随后用 `S2-01` 验证禁飞事件拦截。此操作不会向PX4发指令。

这是一条**本地合成执行链路**。没有调用云模型、没有控制PX4、没有真实飞行安全指标。原调度助手仍只负责问答/草稿/几何预览，地图真实选点尚未直接送入正式执行。

## 两种本地传输

默认 `AERIS_DISPATCH_TRANSPORT=direct`：服务内直接调用 `EdgeService`。SQLite + JSONL是真实持久化；不需要Docker、PostgreSQL或Redis。

需要展示跨进程收发时，从仓库根运行：

```powershell
docker compose -f ops/docker-compose.yml up -d mosquitto
# 第一个终端；Python换成你实际的虚拟环境路径
.venv/Scripts/python.exe -m edge.mqtt
```

另开终端启动网页和API：

```powershell
$env:AERIS_DISPATCH_TRANSPORT = 'mqtt'
cd apps/console
npm.cmd run dev:all
```

MQTT默认车辆 `local-mock-1`，回环地址 `127.0.0.1:1883`，topic前缀 `lowalt/v1/mock/vehicles/local-mock-1/`。命令走 `commands`，回传走 `acks` / `telemetry` / `status` / `heartbeat`，均QoS1、非retained。此Broker匿名配置只用于本机。

MQTT执行端在Broker中断时继续推进已接受的**合成**任务；连接恢复后发送原始ACK和持久状态，绝不重新启动命令。API重启也只恢复订阅/查询，不重发命令。ACK/状态每约5秒重新对账，不能将Broker PUBACK当飞控ACK。

API默认存储 `logs/local-dispatch/`；MQTT执行端存储 `logs/local-edge/`。`AERIS_DISPATCH_DIR` 可改API目录，`edge.mqtt --state-dir` 可改执行端目录；二者不要共用。同一状态目录只允许一个进程写。历史合成产物不进Git。

## 恢复和已知限制

- 单机当前只允许一个活动命令。新命令不会自动替换在飞航线；旧版本或同版本不同ID会拒绝。
- 同一个命令ID的受理/拒绝会保留，重试不能让原先被拒的命令后来突然执行。
- 执行端重启把未完成记录标为 `recovering`，不自动重放。默认直连可在页面明确结束合成测试。MQTT模式需先退出daemon、核对 `logs/local-edge/commands.sqlite3`；纯测试需要全新场景时用新的 `--state-dir` 和API `AERIS_DISPATCH_DIR`，保留原目录用于审计。真实飞控不得按此方法清状态。
- 页面关闭不会取消任务；API服务关闭会停止本地合成推进。服务恢复后必须对账。
- `S2-01` 的拦截是当前基线校验的真实结果。当前A*不能根据反馈真正重规划；不会把重复计算包装成新算法。
- 真实地理草稿还缺ENU原点、机型参数和飞控任务上传；PX4实时读数继续使用独立 `/api/telemetry/stream`，FakeExecutor不会混入。
- 心跳已传输；端到端链路健康判定、当前状态下备用路线独立复核和真实切换仍未打通。
- 如下发后API断电到连审计都来不及记录，任务保留为需恢复，不会自动重新规划/下发；需人工核对执行端原始记录。

## HTTP接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/dispatch/health` | 模式、传输、场景清单、直连活动任务 |
| `POST /api/dispatch/proposals` | `{ "scenario_id": "S1-01" }`，生成待审参数及5分钟有效摘要 |
| `POST /api/dispatch/tasks/{id}/confirm` | `{ "confirmed": true, "review_digest": "..." }`，原任务幂等确认 |
| `GET /api/dispatch/tasks/{id}` | 规划结果、ACK、独立执行状态、合成采样与最近30条M3审计；只读 |
| `POST /api/dispatch/tasks/{id}/abandon` | `{ "confirmed": true }`，仅直连模式明确结束合成任务 |

正式对象继续复用 `core.models`、`ValidationReport`、`ExecutionObservation`，执行状态另用 `agent.execution.ExecutionStatus`，不复制核心模型。

```powershell
.venv/Scripts/python.exe -m pytest tests/test_local_dispatch.py
$env:LOWALT_TEST_MQTT = '1'
.venv/Scripts/python.exe -m pytest tests/test_local_mqtt.py
```

本地API无登录鉴权，仅绑定回环地址，不能直接作为公网服务使用。
