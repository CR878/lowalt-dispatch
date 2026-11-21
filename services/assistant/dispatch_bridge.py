"""Task draft from a natural-language intake — the only intake → task bridge.

An intake is evidence, not a ``core.models.Task``.  This module turns one into a
**draft task** once every required number is supplied by a human.  Nothing here
executes, plans, or touches a flight controller: a valid ``Task`` is the end of
this bridge, and the response always carries ``dispatch_enabled=false``.

Why a draft and not a dispatch:

* ``core.models.Task`` accepts WGS84 positions, but the M3 execution chain is
  bound to the frozen 3 km ENU scenario; there is no ENU origin or vehicle
  energy profile for a real 45 km mission.  Guessing either would fabricate
  numbers, so this module refuses instead.
* Real airspace (NOTAM / UOM) is not integrated.  Every response repeats that.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from core.models import AltitudeReference, DataProvenance, Frame, Position, Task


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DispatchDraftInput(Strict):
    """Human-supplied values; nothing is inferred from the conversation."""

    vehicle_type: str | None = Field(default=None, min_length=1, max_length=100)
    alt_m: float | None = None
    alt_ref: AltitudeReference | None = None
    initial_energy_wh: float | None = Field(default=None, gt=0)
    reserve_energy_wh: float | None = Field(default=None, ge=0)
    time_limit_s: float | None = Field(default=None, gt=0)
    energy_source: str = Field(
        default="",
        max_length=200,
        description="这些能耗数字从哪来（实测/厂家/人工假设），会写进 provenance",
    )


def _blocker(code: str, detail: str) -> dict:
    return {"code": code, "detail": detail}


def build_task_draft(intake: dict, body: DispatchDraftInput) -> dict:
    """Return ``draft_ready`` with a validated Task, or ``blocked`` with reasons."""
    blockers: list[dict] = []
    warnings: list[str] = [
        "真实空域（NOTAM / UOM）、地形、线缆与动态障碍未接入；本任务单不代表获准飞行。",
        "本接口只生成任务单，不规划、不下发、不控制飞控；dispatch_enabled 恒为 false。",
    ]

    payload_kg = intake.get("payload_kg")
    if payload_kg is None:
        blockers.append(_blocker("missing_payload", "工单没有载荷重量，任务单必须有 payload_kg"))

    if not body.vehicle_type:
        blockers.append(_blocker("missing_vehicle", "未指定机型；不要从对话里猜，需显式选择 vehicle_type"))

    if body.alt_m is None or body.alt_ref is None:
        blockers.append(
            _blocker("missing_altitude", "缺少巡航高度与高度基准（alt_m + alt_ref），不允许填默认值")
        )

    if body.initial_energy_wh is None or body.reserve_energy_wh is None:
        blockers.append(
            _blocker(
                "missing_energy",
                "缺少 initial_energy_wh / reserve_energy_wh；机型库没有可验证的 Wh/m，"
                "禁止用标称电池或最大航程反推",
            )
        )
    elif body.reserve_energy_wh >= body.initial_energy_wh:
        blockers.append(_blocker("invalid_energy", "reserve_energy_wh 必须小于 initial_energy_wh"))

    real_route = intake.get("real_route") or {}
    if real_route.get("status") != "ok":
        blockers.append(
            _blocker(
                "no_real_route",
                "工单没有可用真实航线："
                + str(real_route.get("reason") or "未计算")
                + "；未用直线或仿真路线代替",
            )
        )

    origin, destination = intake.get("origin") or {}, intake.get("destination") or {}
    for label, place in (("起点", origin), ("终点", destination)):
        if place.get("crs") != "EPSG:4326" or not place.get("point"):
            blockers.append(
                _blocker(
                    "missing_coordinates",
                    f"{label}「{place.get('name')}」没有 WGS84 坐标，任务单不能生成",
                )
            )

    if blockers:
        return {
            "status": "blocked",
            "blockers": blockers,
            "warnings": warnings,
            "task": None,
            "dispatch_enabled": False,
            "is_simulated": True,
            "execution_blockers": _execution_blockers(intake),
        }

    try:
        origin_position = Position(
            frame=Frame.WGS84,
            lat_deg=float(origin["point"][1]),
            lon_deg=float(origin["point"][0]),
            alt_m=float(body.alt_m),
            alt_ref=body.alt_ref,
        )
        destination_position = Position(
            frame=Frame.WGS84,
            lat_deg=float(destination["point"][1]),
            lon_deg=float(destination["point"][0]),
            alt_m=float(body.alt_m),
            alt_ref=body.alt_ref,
        )
        task = Task(
            task_id=str(uuid4()),
            origin=origin_position,
            destination=destination_position,
            payload_kg=float(payload_kg),
            vehicle_type=body.vehicle_type,
            initial_energy_wh=float(body.initial_energy_wh),
            reserve_energy_wh=float(body.reserve_energy_wh),
            time_limit_s=body.time_limit_s,
            provenance=DataProvenance(
                source=f"assistant_intake:{intake['intake_id']}",
                version="1",
                captured_at=datetime.now(UTC),
                is_simulated=True,
                uncertainty_note=(
                    "任务单由人工确认的工单生成；能耗来源："
                    + (body.energy_source or "未说明")
                    + "。WGS84 坐标来自公开地图/地图点选，非测绘成果。"
                ),
            ),
        )
    except (KeyError, TypeError, ValueError) as exc:
        return {
            "status": "blocked",
            "blockers": [_blocker("invalid_task", f"任务单字段校验失败：{exc}")],
            "warnings": warnings,
            "task": None,
            "dispatch_enabled": False,
            "is_simulated": True,
            "execution_blockers": _execution_blockers(intake),
        }

    return {
        "status": "draft_ready",
        "blockers": [],
        "warnings": warnings,
        "task": task.model_dump(mode="json"),
        "dispatch_enabled": False,
        "is_simulated": True,
        "execution_blockers": _execution_blockers(intake),
        "next_steps": [
            "该任务单是 WGS84；M3 执行链只吃 v0 的 3 km ENU 场景，尚未接线。",
            "要真正派飞，还需：ENU 原点、可验证的机型能耗、真实空域人工核对、PX4 任务上传。",
        ],
    }


def _execution_blockers(intake: dict) -> list[dict]:
    """Things that block execution even when the task draft is valid."""
    return [
        _blocker(
            "no_enu_origin",
            "M3/validator 绑定 v0 的 3 km ENU 场景；真实经纬度没有已定义的 ENU 原点。",
        ),
        _blocker(
            "unverified_vehicle_energy",
            "机型库无经标定的 Wh/m 与可用电量；能耗必须由人工提供并写明来源。",
        ),
        _blocker(
            "airspace_manual_review",
            "真实空域未接入；NOTAM / UOM / 机场与人口密集区限制须人工核对。",
        ),
        _blocker(
            "no_flight_control",
            "执行端 dispatch_enabled=false；不产生飞控指令。",
        ),
    ]
