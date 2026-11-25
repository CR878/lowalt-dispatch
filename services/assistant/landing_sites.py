"""Operator landing-site ledger. Roads and OSM tags are clues, not approval.

This build has no operator ledger. The bundled file is an offline example and
must not become an operational pass.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

EXAMPLE_LEDGER_ID = "example-offline-medical-desk"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "landing_ledger_example_offline.json"
REQUIRED_FIELDS = (
    "point_or_extent",
    "allowed_use",
    "responsible_party",
    "verified_at",
    "valid_until",
    "occupancy_status",
    "open_status",
    "authorization_evidence",
)


def _unavailable(reason: str, **extra):
    return {
        "status": "unavailable",
        "verdict": None,
        "reason": reason,
        "dispatch_enabled": False,
        "operationally_approved": False,
        "pass_allowed": False,
        "required_fields": list(REQUIRED_FIELDS),
        **extra,
    }


def _parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _inside(point, extent) -> bool:
    lng, lat = point
    west, south, east, north = extent
    return west <= lng <= east and south <= lat <= north


def assess_site(site: dict) -> dict:
    missing = []
    if site.get("point") is None and site.get("extent") is None:
        missing.append("point_or_extent")
    for field in REQUIRED_FIELDS:
        if field == "point_or_extent":
            continue
        if not site.get(field):
            missing.append(field)
    conflicts = []
    verified = _parse_time(site.get("verified_at"))
    valid_until = _parse_time(site.get("valid_until"))
    if (
        site.get("verified_at")
        and site.get("valid_until")
        and (verified is None or valid_until is None or valid_until <= verified)
    ):
        conflicts.append("有效期不晚于核验时间，需人工核对台账日期")
    if site.get("open_status") == "closed" and site.get("occupancy_status") == "clear":
        conflicts.append("开放状态为关闭，同时占用状态为空闲，两项冲突")
    point, extent = site.get("point"), site.get("extent")
    if (
        isinstance(point, (list, tuple))
        and isinstance(extent, (list, tuple))
        and len(point) == 2
        and len(extent) == 4
    ):
        if not _inside(point, extent):
            conflicts.append("坐标不在申报范围内")
    manual = [f"补齐并核验：{field}" for field in missing]
    manual += [f"冲突待人工处理：{item}" for item in conflicts]
    return {
        "site_id": site.get("site_id"),
        "name": site.get("name"),
        "missing": missing,
        "conflicts": conflicts,
        "manual_checks": manual,
        "accepted": False,
    }


def load_example_ledger() -> dict:
    ledger = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if ledger.get("ledger_id") != EXAMPLE_LEDGER_ID:
        raise ValueError("离线样例标识与文件不一致")
    if (
        ledger.get("grade") != "example_offline"
        or "example" not in ledger.get("labels", [])
        or "offline" not in ledger.get("labels", [])
    ):
        raise ValueError("离线样例缺少 example/offline 标签")
    return ledger


def assess_landing(origin, destination, ledger_id: str | None = None) -> dict:
    """No operator ledger is loaded from the network. Unknown ids stay unavailable."""
    base = {
        "origin": list(origin),
        "destination": list(destination),
        "clue_policy": "道路、空地、OSM 标签和视觉空闲只可作线索，不能当作场点或通过。",
    }
    if not ledger_id:
        return _unavailable(
            "没有运营方确认的场点台账，起降点未核实；不能据此判断不能飞",
            sites=[],
            **base,
        )
    if ledger_id != EXAMPLE_LEDGER_ID:
        return _unavailable("没有这份运营方台账，不能用道路或 OSM 线索补一场点", ledger_id=ledger_id, **base)
    ledger = load_example_ledger()
    sites = [assess_site(site) for site in ledger.get("sites") or []]
    return _unavailable(
        "这是标注为 example/offline 的桌面推演样例，不是运营方确认，不能判通过",
        ledger_id=ledger["ledger_id"],
        grade=ledger["grade"],
        labels=ledger["labels"],
        sites=sites,
        clues=ledger.get("clues") or [],
        market_note=ledger.get("market_note"),
        **base,
    )
