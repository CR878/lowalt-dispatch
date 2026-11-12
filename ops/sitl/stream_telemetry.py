"""Read-only MAVSDK collector. Run in the same network namespace as PX4."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
from contextlib import nullcontext
from datetime import datetime, timezone
from pathlib import Path

from mavsdk import System


def number(value, *, low=-math.inf, high=math.inf):
    return value if math.isfinite(value) and low <= value <= high else None


async def collect(output: Path, address: str):
    drone = System()
    await drone.connect(system_address=address)
    latest = {}
    loop = asyncio.get_running_loop()
    connected = False

    async def connection():
        nonlocal connected
        async for state in drone.core.connection_state():
            connected = state.is_connected
            if not connected:
                latest.clear()

    async def remember(key, updates):
        async for value in updates:
            if connected:
                latest[key] = (loop.time(), value)

    def fresh(key, seconds=5):
        entry = latest.get(key)
        return entry[1] if entry and loop.time() - entry[0] <= seconds else None

    async def publish():
        destination = (
            nullcontext(sys.stdout)
            if output == Path("-")
            else output.open("a", encoding="utf-8", buffering=1)
        )
        with destination as sink:
            next_frame = 0.0
            async for attitude in drone.telemetry.attitude_euler():
                now = loop.time()
                if not connected or now < next_frame:
                    continue
                next_frame = now + 1
                frame = {
                    "source": "sim:px4_sitl",
                    "is_simulated": True,
                    "captured_at": datetime.now(timezone.utc).isoformat(),  # noqa: UP017 (container Python 3.10)
                    "roll": number(attitude.roll_deg, low=-180, high=180),
                    "pitch": number(attitude.pitch_deg, low=-180, high=180),
                    "heading": attitude.yaw_deg % 360 if math.isfinite(attitude.yaw_deg) else None,
                    "in_air": fresh("in_air", math.inf),
                }
                mode = fresh("flight_mode", math.inf)
                if mode is not None:
                    frame["flight_mode"] = mode.name
                battery = fresh("battery")
                if battery is not None:
                    frame["battery"] = number(battery.remaining_percent, low=0, high=100)
                    frame["voltage"] = number(battery.voltage_v, low=0)

                health = fresh("health", math.inf)
                ned = fresh("ned")
                if health and health.is_local_position_ok and ned is not None:
                    x, y, z = ned.position.north_m, ned.position.east_m, ned.position.down_m
                    if all(map(math.isfinite, (x, y, z))):
                        frame["position"] = {"frame": "NED", "x_m": x, "y_m": y, "z_m": z}
                    velocity = ned.velocity
                    frame["speed"] = number(math.hypot(velocity.north_m_s, velocity.east_m_s))
                    frame["climb"] = number(-velocity.down_m_s)
                position = fresh("global")
                if health and health.is_global_position_ok and position is not None:
                    lat = number(position.latitude_deg, low=-90, high=90)
                    lon = number(position.longitude_deg, low=-180, high=180)
                    if lat is not None and lon is not None:
                        frame["position"] = {"frame": "WGS84", "lat_deg": lat, "lon_deg": lon}
                    if health.is_home_position_ok:
                        frame["altitude"] = number(position.relative_altitude_m)
                        frame["altitude_ref"] = "rel_takeoff"
                sink.write(json.dumps(frame, allow_nan=False) + "\n")
                sink.flush()

    feeds = {
        "battery": drone.telemetry.battery,
        "in_air": drone.telemetry.in_air,
        "flight_mode": drone.telemetry.flight_mode,
        "health": drone.telemetry.health,
        "global": drone.telemetry.position,
        "ned": drone.telemetry.position_velocity_ned,
    }
    await asyncio.gather(connection(), publish(), *(remember(key, feed()) for key, feed in feeds.items()))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--address", default="udpin://0.0.0.0:14540")
    args = parser.parse_args()
    try:
        asyncio.run(collect(args.output, args.address))
    except KeyboardInterrupt:
        pass
