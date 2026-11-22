"""把 yaml 场景 + geojson 几何装配成 core 契约对象。

这是 M1 的出口：只要 Task / RiskSnapshot / RoutePlan 三个对象能从这里产出，
M2 的规划器和 M3 的 Agent 就能真接起来，而不是各自造一份样例数据。

**能量值不在这里凭空生成。** `build_task()` 要求调用方显式传入
`initial_energy_wh` 与 `reserve_energy_wh`，因为它们只能来自机型参数（由 A 提供）。
演示脚本传入什么值，就必须在输出里标成合成值。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from core.models import (
    AltitudeReference,
    DataProvenance,
    Frame,
    LandingSite,
    Position,
    RiskEvent,
    RiskSnapshot,
    RoutePlan,
    Task,
)
from planner.astar import PathResult
from planner.scene import Scene, Zone


def _pos(x: float, y: float, alt: float) -> Position:
    return Position(frame=Frame.ENU_M, x_m=x, y_m=y, alt_m=alt, alt_ref=AltitudeReference.REL_TAKEOFF)


def _prov(t0: datetime, source: str) -> DataProvenance:
    return DataProvenance(source=source, version="v0", captured_at=t0, is_simulated=True)


def build_task(
    scenario: dict,
    t0: datetime,
    *,
    vehicle_type: str,
    initial_energy_wh: float,
    reserve_energy_wh: float,
) -> Task:
    o, d = scenario["origin"], scenario["destination"]
    return Task(
        task_id=f"T-{scenario['id']}",
        origin=_pos(o["x_m"], o["y_m"], o.get("alt_m", 0.0)),
        destination=_pos(d["x_m"], d["y_m"], d.get("alt_m", 0.0)),
        payload_kg=float(scenario["payload_kg"]),
        vehicle_type=vehicle_type,
        initial_energy_wh=initial_energy_wh,
        reserve_energy_wh=reserve_energy_wh,
        time_limit_s=scenario.get("time_limit_s"),
        provenance=_prov(t0, "sim:scenario_v0"),
    )


def build_snapshot(
    scenario: dict,
    scene: Scene,
    t0: datetime,
    *,
    valid_for_s: float = 1800.0,
) -> RiskSnapshot:
    """把场景的 `at_s` 事件转成带绝对时间的 RiskEvent。

    `event_id` 直接用 zone_id，方便校验器按 id 取几何；这一约定写在 docs/接口契约.md。
    """
    events: list[RiskEvent] = []
    for ev in scenario.get("events") or []:
        if ev.get("kind") != "restriction_zone":
            continue
        zone: Zone | None = scene.zones.get(ev["zone_id"])
        if zone is None:
            continue
        events.append(
            RiskEvent(
                event_id=zone.zone_id,
                kind="restriction_zone",
                geometry={"type": "Polygon", "coordinates": [zone.polygon]},
                alt_min_m=zone.alt_min_m,
                alt_max_m=zone.alt_max_m,
                effective_from=t0 + timedelta(seconds=float(ev.get("at_s", 0))),
                effective_until=None,
                provenance=_prov(t0, "sim:scenario_v0"),
            )
        )

    # 只处理"从一开始就关闭"的备降点。中途关闭（at_s > 0）需要可用性时窗，
    # 目前 LandingSite 只有一个 available_from/until 区间，表达不了"中途失效"，标为待办。
    closed_from_start = {
        c["site_id"]
        for c in (scenario.get("landing_site_changes") or [])
        if c.get("change") == "closed" and float(c.get("at_s", 0)) == 0.0
    }

    sites = [
        LandingSite(
            site_id=s.site_id,
            position=_pos(s.x, s.y, 0.0),
            radius_m=s.radius_m,
            compatible_vehicle_types=["placeholder"],
            occupied=False,
            provenance=_prov(t0, "sim:scenario_v0"),
        )
        for sid, s in scene.sites.items()
        if sid not in closed_from_start
    ]

    return RiskSnapshot(
        snapshot_id=f"SNAP-{scenario['id']}-{t0.strftime('%Y%m%dT%H%M%S')}",
        captured_at=t0,
        valid_until=t0 + timedelta(seconds=valid_for_s),
        landing_sites=sites,
        events=events,
        note="场景装配快照；几何与时间为仿真构造，机型参数不在此处",
    )


def route_from_path(
    path: PathResult,
    task: Task,
    snapshot: RiskSnapshot,
    *,
    algorithm: str = "astar_static",
    plan_version: str = "v1",
    energy_budget_wh: float,
) -> RoutePlan:
    """把 A* 的折线转成 RoutePlan。高度按起终点线性插值。

    `energy_budget_wh` 必须由调用方给（来自机型参数与任务能量），这里不估算。
    """
    if not path.found:
        raise ValueError(f"无法从一条未找到的路径构造 RoutePlan：{path.reason}")

    ox, oy = task.origin.x_m or 0.0, task.origin.y_m or 0.0
    dx, dy = task.destination.x_m or 0.0, task.destination.y_m or 0.0
    total = ((dx - ox) ** 2 + (dy - oy) ** 2) ** 0.5 or 1.0

    waypoints: list[Position] = []
    for x, y in path.waypoints:
        frac = min(1.0, max(0.0, ((x - ox) ** 2 + (y - oy) ** 2) ** 0.5 / total))
        alt = task.origin.alt_m + frac * (task.destination.alt_m - task.origin.alt_m)
        waypoints.append(_pos(x, y, alt))

    return RoutePlan(
        route_id=f"{task.task_id}-{plan_version}",
        plan_version=plan_version,
        snapshot_id=snapshot.snapshot_id,
        algorithm=algorithm,
        waypoints=waypoints,
        energy_budget_wh=energy_budget_wh,
        diversion_site_id=None,
        valid_until=snapshot.valid_until,
        checks=[],
    )


def utc_now() -> datetime:
    return datetime.now(UTC)
