"""Natural-language task intakes: persisted evidence records, not executable Tasks.

An intake is NOT ``core.models.Task``. It never enters the M3 state machine,
never produces a flight command, and is always marked simulated. Its purpose is
to make a spoken request and the evidence behind it visible in the web console.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

ROOT = Path(__file__).resolve().parents[2]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlaceQuery(Strict):
    name: str = Field(min_length=1, max_length=120)


class ForecastQuery(Strict):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    scheduled_for: str | None = None


class IntakeCreate(Strict):
    text: str = Field(min_length=1, max_length=3000)
    origin: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=120)
    scheduled_for: str | None = None
    schedule_note: str = ""
    schedule_confirmed: bool = False
    origin_point: list[float] | None = None
    destination_point: list[float] | None = None
    places_confirmed: bool = False
    payload_kg: float | None = Field(default=None, ge=0, le=100)
    priority: Literal["P1", "P2"] | None = None


class PlaceEvidence(Strict):
    name: str
    point: list[float] | None = None
    crs: str = "unresolved"
    source: str
    address: str = ""
    is_simulated: bool = True


class WeatherEvidence(Strict):
    status: Literal["ok", "unavailable"] = "unavailable"
    kind: Literal["forecast"] = "forecast"
    source: str = "Open-Meteo / hourly forecast"
    scheduled_for: str | None = None
    valid_for: str | None = None
    values: dict[str, float | None] = Field(default_factory=dict)
    reason: str = ""
    note: str = "模式预报值，不是实测；风速未进入能耗或绕路计算。"


class TaskIntake(Strict):
    intake_id: str
    text: str
    origin: PlaceEvidence
    destination: PlaceEvidence
    scheduled_for: str | None
    schedule_note: str
    payload_kg: float | None
    priority: str | None
    weather: WeatherEvidence
    airspace: dict
    route_preview: dict | None
    warnings: list[str]
    created_at: str
    is_simulated: Literal[True] = True
    dispatch_enabled: Literal[False] = False

    @classmethod
    def build(
        cls,
        body: IntakeCreate,
        *,
        origin: PlaceEvidence,
        destination: PlaceEvidence,
        weather: WeatherEvidence,
        airspace: dict,
        route_preview: dict | None,
        warnings: list[str],
    ):
        return cls(
            intake_id=str(uuid4()),
            text=body.text,
            origin=origin,
            destination=destination,
            scheduled_for=body.scheduled_for,
            schedule_note=body.schedule_note,
            payload_kg=body.payload_kg,
            priority=body.priority,
            weather=weather,
            airspace=airspace,
            route_preview=route_preview,
            warnings=warnings,
            created_at=datetime.now(UTC).isoformat(),
        )


class IntakeStore:
    """JSON-per-intake store under ``AERIS_INTAKE_DIR`` (default logs/intakes)."""

    def __init__(self, root: Path | None = None):
        self.root = root or Path(os.getenv("AERIS_INTAKE_DIR", str(ROOT / "logs/intakes")))
        self._lock = threading.RLock()

    def _path(self, intake_id: str) -> Path:
        if not intake_id or "/" in intake_id or "\\" in intake_id or ".." in intake_id:
            raise KeyError(intake_id)
        return self.root / f"{intake_id}.json"

    def create(self, record: TaskIntake) -> dict:
        payload = json.dumps(record.model_dump(mode="json"), ensure_ascii=False)
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            path = self._path(record.intake_id)
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(payload, encoding="utf-8")
            tmp.replace(path)
        return record.model_dump(mode="json")

    def get(self, intake_id: str) -> dict:
        path = self._path(intake_id)
        with self._lock:
            if not path.exists():
                raise KeyError(intake_id)
            return json.loads(path.read_text(encoding="utf-8"))

    def list(self, limit: int = 100) -> list[dict]:
        with self._lock:
            if not self.root.exists():
                return []
            paths = sorted(self.root.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
            return [json.loads(p.read_text(encoding="utf-8")) for p in paths]


store = IntakeStore()
