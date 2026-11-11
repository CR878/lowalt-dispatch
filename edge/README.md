# edge —— 边缘执行端

**负责人：A（与 C 配合）**　**状态：🟡 控制流可用（离线 demo + 32 项单测）；真实 SITL 未接**

## 一句话

云端下发的 `PlanCommand` 到这里，先判能不能执行（过期 / 重复 / 任务不符），
再交给执行器，产出 `PlanAck` 和 `ExecutionObservation`。**不做规划、不做校验、不改飞控模式以外的事。**

## 现在有什么

| 文件 | 作用 |
|---|---|
| `contracts.py` | `ExecutionRecord` / `CommandVerdict` / `EdgeEvent`：边缘端自己的记录类型 |
| `store.py` | SQLite 持久化：一个 `command_id` 一条记录，`BEGIN IMMEDIATE` 保证并发只有一个能占用 |
| `guard.py` | 纯函数准入：时间窗、任务绑定、run_mode、航点结构 |
| `executor.py` | `Executor` Protocol、`FakeExecutor`（确定性合成轨迹）、`MavsdkExecutor`（真实接入位，未实测） |
| `telemetry.py` | 组装 `ExecutionObservation` 与 JSONL 追加写 |
| `service.py` | 主流程：`submit()` 受理、`tick()` 推进、`recover()` 对账 |
| `demo.py` | 离线 demo：真实 A* 航线 + 合成执行器，不连 MQTT / 不连飞控 |

## 写死的语义

1. **去重**：同一 `command_id` 只执行一次。重复投递返回**原 ACK**，`execution_count` 不增加。
2. **内容冲突**：同一 `command_id` 换了内容 → 拒绝，不覆盖原记录。
3. **过期**：`now >= expires_at` → `accepted=false`，`reject_reason` 写明过期时刻。
4. **未来命令**：`now < issued_at` → 拒绝。
5. **任务绑定**：`EdgeService(task_id=...)` 时，别的任务的命令一律拒绝。
6. **ACK 不等于完成**：`accepted=true` 只表示执行端接下了；`fc_mode` 原样透传飞控模式名。
7. **遥测**：每条都带 `task_id`、`accepted_command_id`、`state.executing_plan_version`，`provenance.is_simulated=True`。
8. **ENU 不下发真实飞控**：`MavsdkExecutor` 遇到 ENU 航点直接拒绝——原点未定，转换就是猜。
9. **断连不重发**：云端链路判定复用 `agent/link.py` 的 `CloudLinkMonitor`；断连时只允许按已缓存且仍有效的方案执行，这是"本地备用方案切换"，不是"边缘实时重规划"。
10. **重启不重放**：`recover()` 把未完成记录标成 `recovering`，等对账，不重新执行、不重新发布命令。

## 怎么跑

```bash
# 正常：真实 A* 航线 + 合成执行器
.venv/Scripts/python.exe -m edge.demo --scenario S1-01

# 重复投递：第二次返回原 ACK，execution_count 仍为 1
.venv/Scripts/python.exe -m edge.demo --scenario S1-01 --duplicate

# 过期命令：accepted=false，遥测 0 条
.venv/Scripts/python.exe -m edge.demo --scenario S1-01 --expired

# 只跑执行端测试
.venv/Scripts/python.exe -m pytest tests/test_edge_guard.py tests/test_edge_store.py tests/test_edge_executor.py tests/test_edge_service.py -q
```

产物落在 `logs/edge/<批次>/`：`edge_MOCK.sqlite3`、`telemetry_MOCK.jsonl`、`audit_MOCK.jsonl`、`summary_MOCK.json`。

## 还没做的

- **真实 MQTT 接入**：`agent/messaging.py` 是云侧客户端；边缘侧还需要一个订阅 `.../commands`、发布 `.../acks` 与 `.../telemetry` 的适配器。契约已定，代码未写。
- **真实 PX4**：`MavsdkExecutor` 只做依赖探测与坐标准入。`upload_mission` / 遥测流 / abort 都还是 `NotImplementedError`——没装 `mavsdk`、没有 SITL，写了也验证不了。
- **断连时延实测**：`CloudLinkMonitor` 的阈值是示例值，检测/恢复时延必须在真实网络条件下测，不能拿默认值当结论。
- **命令去重跨进程**：目前靠 SQLite 主键；多实例部署时还要考虑同一 `command_id` 落到不同实例的竞态（当前设计是单编排实例）。

## 边界（写材料前自查）

- 能说：执行端实现了命令去重、过期拒绝、ACK 与遥测契约，离线 demo 可复现。
- 不能说：PX4 在环通过、实飞验证、边缘实时重规划、云端部署完成。
- `FakeExecutor` 的轨迹、能耗、速度全是合成值，不得作为性能或安全效果证据。
