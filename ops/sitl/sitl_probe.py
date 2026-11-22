"""PX4 SITL 连通性与遥测探针（独立脚本，不依赖仓库代码）。

必须与 SITL 在同一网络命名空间里跑（当前是 `px4` 容器的 /work）：

    docker exec px4 python3 /work/sitl_probe.py

输出 JSON，字段对齐 core.models.VehicleState 的关键项。
只证明 MAVLink 通道与遥测可用；不证明能起飞、能上传任务或能执行。
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from mavsdk import System

ADDRESS = "udpin://0.0.0.0:14540"


async def _first(agen, timeout: float = 12.0):
    return await asyncio.wait_for(agen.__anext__(), timeout=timeout)


async def collect(address: str = ADDRESS) -> dict:
    drone = System()
    await drone.connect(system_address=address)

    connected = False
    async for state in drone.core.connection_state():
        if state.is_connected:
            connected = True
            break

    attitude = await _first(drone.telemetry.attitude_euler())
    odometry = await _first(drone.telemetry.odometry())
    battery = await _first(drone.telemetry.battery())
    in_air = await _first(drone.telemetry.in_air())
    health = await _first(drone.telemetry.health())

    return {
        "connected": connected,
        "address": address,
        "attitude_deg": {
            "roll": round(attitude.roll_deg, 3),
            "pitch": round(attitude.pitch_deg, 3),
            "yaw": round(attitude.yaw_deg, 3),
        },
        "position_body_m": {
            "x": round(odometry.position_body.x_m, 3),
            "y": round(odometry.position_body.y_m, 3),
            "z": round(odometry.position_body.z_m, 3),
            "frame": "NED",
        },
        "battery_remaining_pct": round(battery.remaining_percent, 2),
        "in_air": in_air,
        "health": {
            "gyrometer_ok": health.is_gyrometer_calibration_ok,
            "accelerometer_ok": health.is_accelerometer_calibration_ok,
            "magnetometer_ok": health.is_magnetometer_calibration_ok,
            "local_position_ok": health.is_local_position_ok,
            "global_position_ok": health.is_global_position_ok,
            "home_position_ok": health.is_home_position_ok,
            "armable": health.is_armable,
        },
        "provenance": {
            "source": "sim:px4_sitl",
            "is_simulated": True,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "note": "SITL 遥测，非真机；未校准，未起飞",
        },
    }


def main() -> int:
    print(json.dumps(asyncio.run(collect()), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
