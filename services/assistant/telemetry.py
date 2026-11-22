"""Read a live M4/SITL NDJSON feed and stream the latest flight snapshot."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from agent.edge_decisions import ExecutionObservation
from core.models import AltitudeReference, Frame

STALE_SECONDS = 5
TAIL_BYTES = 64 * 1024


class TelemetryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class GeographicPosition(TelemetryModel):
    frame: Literal["WGS84"]
    lon_deg: float = Field(ge=-180, le=180)
    lat_deg: float = Field(ge=-90, le=90)


class LocalPosition(TelemetryModel):
    frame: Literal["NED", "ENU"]
    x_m: float
    y_m: float
    z_m: float


class LiveTelemetry(TelemetryModel):
    source: str = Field(min_length=1, max_length=120)
    is_simulated: bool
    captured_at: AwareDatetime
    task_id: str | None = Field(default=None, max_length=160)
    plan_version: str | None = Field(default=None, max_length=80)
    position: GeographicPosition | LocalPosition | None = None
    battery: float | None = Field(default=None, ge=0, le=100)
    voltage: float | None = Field(default=None, ge=0)
    current: float | None = None
    energyWh: float | None = Field(default=None, ge=0)
    roll: float | None = Field(default=None, ge=-180, le=180)
    pitch: float | None = Field(default=None, ge=-180, le=180)
    heading: float | None = Field(default=None, ge=0, lt=360)
    speed: float | None = Field(default=None, ge=0)
    climb: float | None = None
    altitude: float | None = None
    altitude_ref: AltitudeReference | None = None
    in_air: bool | None = None
    flight_mode: str | None = Field(default=None, max_length=80)
    gps_fix: str | None = Field(default=None, max_length=80)

    def age_seconds(self) -> float:
        return (datetime.now(UTC) - self.captured_at).total_seconds()


def _edge_frame(record: dict) -> LiveTelemetry:
    observation = ExecutionObservation.model_validate(record)
    state = observation.state
    pos = state.position
    position = (
        GeographicPosition(frame="WGS84", lon_deg=pos.lon_deg, lat_deg=pos.lat_deg)
        if pos.frame is Frame.WGS84
        else LocalPosition(frame="ENU", x_m=pos.x_m, y_m=pos.y_m, z_m=pos.alt_m)
    )
    return LiveTelemetry(
        source=state.provenance.source,
        is_simulated=state.provenance.is_simulated,
        captured_at=state.ts,
        task_id=observation.task_id,
        plan_version=state.executing_plan_version,
        position=position,
        speed=state.groundspeed_mps,
        energyWh=state.energy_remaining_wh,
        altitude=pos.alt_m,
        altitude_ref=pos.alt_ref,
        flight_mode=state.flight_mode,
        gps_fix=state.gps_fix,
    )


def read_latest(path: Path) -> LiveTelemetry | None:
    """Bound the read and ignore incomplete, invalid, future and MOCK records."""
    try:
        with path.open("rb") as stream:
            offset = max(0, stream.seek(0, 2) - TAIL_BYTES)
            stream.seek(offset)
            tail = stream.read(TAIL_BYTES)
    except OSError:
        return None

    # A trailing newline commits the record, including during a concurrent append.
    records = tail.rpartition(b"\n")[0].split(b"\n")
    for line in reversed(records[1:] if offset else records):
        try:
            record = json.loads(line)
            if not isinstance(record, dict):
                continue
            frame = _edge_frame(record) if "state" in record else LiveTelemetry.model_validate(record)
            if frame.source == "sim:edge.fake_executor" or frame.source.lower().startswith("mock"):
                continue
            if frame.age_seconds() >= -STALE_SECONDS:
                return frame
        except ValueError:
            continue
    return None


async def stream_telemetry(path: Path):
    latest_at = None
    heartbeat = 0
    while True:
        frame = await asyncio.to_thread(read_latest, path)
        if frame is not None and (latest_at is None or frame.captured_at > latest_at):
            latest_at = frame.captured_at
            yield f"data: {frame.model_dump_json()}\n\n"
        elif heartbeat == 0:
            yield ": telemetry\n\n"
        heartbeat = (heartbeat + 1) % 20
        await asyncio.sleep(0.5)
