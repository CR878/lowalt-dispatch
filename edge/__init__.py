"""M4 执行端：接收云端命令、落到飞控、回传 ACK 与遥测。

边界
----
- 本包**不做规划、不做校验、不改公共契约**；`PlanCommand` / `PlanAck` /
  `VehicleState` 仍以 `core/models.py` 为准。
- 本包**不创建云资源**，也不假装 MQTT 或飞控已联通。
- 真实 PX4 接入写在 `edge/executor.py` 的 `MavsdkExecutor`，未在 SITL 上实测前，
  任何结论只能写"执行端代码就位，SITL 待联调"。
"""
