"""Decision guards, not a replacement for M2's independent route validator."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from agent.contracts import REQUIRED_CHECKS, ValidationReport, route_digest
from core.models import ConstraintCheck, RiskSnapshot, RoutePlan, Task, VehicleState


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timestamps must include a timezone")
    return value.astimezone(UTC)


def snapshot_problem(snapshot: RiskSnapshot, now: datetime) -> str | None:
    try:
        now = utc(now)
        if not snapshot.snapshot_id.strip():
            return "Missing snapshot_id"
        if utc(snapshot.captured_at) > now:
            return "Snapshot captured_at is in the future"
        if snapshot.valid_until is not None and utc(snapshot.valid_until) <= now:
            return "Snapshot expired (expiry is exclusive)"
    except ValueError as exc:
        return str(exc)
    return None


def task_problem(task: Task, now: datetime) -> str | None:
    try:
        if utc(task.provenance.captured_at) > now:
            return "Task source timestamp is in the future"
        if task.provenance.valid_from and utc(task.provenance.valid_from) > now:
            return "Task not effective yet"
        if task.provenance.valid_until and utc(task.provenance.valid_until) <= now:
            return "Task expired"
    except ValueError as exc:
        return str(exc)
    if not task.task_id.strip() or not task.vehicle_type.strip():
        return "Missing task or vehicle identifier"
    if (task.origin.frame, task.origin.alt_ref) != (task.destination.frame, task.destination.alt_ref):
        return "Task endpoints use different coordinate/altitude references"
    if not all(math.isfinite(v) for v in (task.initial_energy_wh, task.reserve_energy_wh, task.payload_kg)):
        return "Task energy/payload must be finite"
    if task.initial_energy_wh <= task.reserve_energy_wh:
        return "Initial energy does not exceed the reserve"
    if task.time_limit_s is not None and (not math.isfinite(task.time_limit_s) or task.time_limit_s <= 0):
        return "Task time limit must be finite and positive when provided"
    return None


def route_problem(route: RoutePlan, task: Task, snapshot: RiskSnapshot, now: datetime) -> str | None:
    try:
        route_digest(route)  # also rejects NaN/Infinity in nested shared models
        if route.valid_until is not None and utc(route.valid_until) <= now:
            return "Route expired"
    except ValueError as exc:
        return str(exc)
    if not route.route_id.strip():
        return "Missing route_id"
    if route.snapshot_id != snapshot.snapshot_id:
        return "Route uses a different snapshot"
    expected = (task.origin.frame, task.origin.alt_ref)
    if any((p.frame, p.alt_ref) != expected for p in route.waypoints):
        return "Route coordinate/altitude reference differs from task"
    return None


def report_failures(
    report: ValidationReport,
    task: Task,
    route: RoutePlan,
    snapshot: RiskSnapshot,
    now: datetime,
    *,
    not_before: datetime,
    vehicle_state: VehicleState | None = None,
) -> list[ConstraintCheck]:
    """Enforce report binding/completeness; do not compute spatial constraints."""
    issues: list[ConstraintCheck] = []

    def fail(name: str, detail: str) -> None:
        issues.append(ConstraintCheck(name=name, passed=False, detail=detail))

    if (report.task_id, report.route_id, report.plan_version, report.snapshot_id, report.route_digest) != (
        task.task_id,
        route.route_id,
        route.plan_version,
        snapshot.snapshot_id,
        route_digest(route),
    ):
        fail("report_identity", "Validator report does not match this exact task/route/snapshot")
    try:
        if not utc(not_before) <= utc(report.verified_at) <= utc(now):
            fail("report_time", "Report is older than this validation call or from the future")
        if vehicle_state is not None:
            if report.vehicle_state_ts is None or utc(report.vehicle_state_ts) != utc(vehicle_state.ts):
                fail("report_state", "Fallback report does not bind the current telemetry timestamp")
    except ValueError as exc:
        fail("report_time", str(exc))
    names = [c.name for c in report.checks]
    if len(names) != len(set(names)):
        fail("report_checks", "Duplicate check names are ambiguous")
    for name in REQUIRED_CHECKS:
        if name not in names:
            fail(name, "Required independent check is missing")
    issues.extend(c for c in report.checks if not c.passed)
    return issues
