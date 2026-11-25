"""Read the same frozen algorithm evidence used by the offline recording UI."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field

from services.assistant.models import Contract

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "apps/console/public/task-evidence.json"
Coordinate = Annotated[float, Field(ge=0, le=3000)]
Point = tuple[Coordinate, Coordinate]


def source_digest(path: Path) -> str:
    """Git normalizes text to LF; Windows line endings must not invalidate evidence."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


class EvidenceQuery(Contract):
    case: Literal["main", "contrast"] = "main"


class EvidenceSample(Contract):
    point: Point
    s_m: float = Field(ge=0)
    margin_wh: float
    nearest_site_id: str | None


class EvidenceCheck(Contract):
    name: str = Field(max_length=80)
    passed: bool
    detail: str = Field(max_length=2000)


class EvidenceCandidate(Contract):
    algorithm: Literal["astar_static", "astar_diversion"]
    found: bool
    length_m: float = Field(ge=0)
    reason: str | None = Field(max_length=2000)


class EvidenceSite(Contract):
    id: str = Field(max_length=80)
    point: Point


class TaskEvidence(Contract):
    case: Literal["main", "contrast"]
    task_id: str = Field(max_length=100)
    scenario_id: str = Field(max_length=80)
    source: str = Field(max_length=240)
    generated_at: str = Field(max_length=80)
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    origin: str = Field(max_length=80)
    destination: str = Field(max_length=80)
    payload_kg: float = Field(ge=0, le=100)
    vehicle_label: str = Field(max_length=120)
    algorithm: Literal["astar_static", "astar_diversion"]
    verdict: Literal["passed", "rejected"]
    route_id: str = Field(max_length=160)
    route_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    length_m: float = Field(ge=0)
    waypoints: list[Point] = Field(min_length=2, max_length=5000)
    samples: list[EvidenceSample] = Field(min_length=1, max_length=1000)
    checks: list[EvidenceCheck] = Field(min_length=1, max_length=20)
    candidates: list[EvidenceCandidate] = Field(min_length=1, max_length=2)
    gaps: list[str] = Field(min_length=1, max_length=12)
    buildings: list[list[Point]] = Field(max_length=200)
    sites: list[EvidenceSite] = Field(max_length=50)
    dispatch_enabled: Literal[False] = False
    is_simulated: Literal[True] = True


def read_task_evidence(case: str = "main") -> dict:
    """Fail closed when the recording artifact no longer matches its source files."""
    if case not in {"main", "contrast"}:
        raise ValueError("未知证据案例")
    try:
        bundle = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        if bundle["version"] != 1:
            raise ValueError("不支持的证据版本")
        if not isinstance(bundle["source_hashes"], dict) or not bundle["source_hashes"]:
            raise ValueError("缺少来源摘要")
        for relative, expected in bundle["source_hashes"].items():
            path = (ROOT / relative).resolve()
            if not path.is_relative_to(ROOT) or source_digest(path) != expected:
                raise ValueError("算法或输入已变化，请重新导出证据")
        raw = bundle["cases"][case]
        fingerprint = hashlib.sha256(
            json.dumps(
                {k: v for k, v in raw.items() if k != "revision"}, sort_keys=True, ensure_ascii=False
            ).encode()
        ).hexdigest()
        if fingerprint != raw["revision"]:
            raise ValueError("证据内容摘要不匹配")
        item = TaskEvidence.model_validate(raw)
        if item.case != case or (item.verdict == "passed") != all(c.passed for c in item.checks):
            raise ValueError("证据结论与校验项不一致")
        return {"status": "ok", "source": item.source, "evidence": item.model_dump(mode="json")}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return {"status": "unavailable", "source": "冻结算法证据", "reason": f"证据不可用：{exc}"}
