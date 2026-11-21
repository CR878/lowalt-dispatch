"""Bridge to existing M2 modules; no new planning or safety algorithm here.

The current baseline cannot adapt to validator feedback. It explicitly returns
no candidate after rejection instead of producing three identical routes.
Current-state fallback validation is deliberately unavailable: M2's validator
only validates a complete task from its origin, not the remaining route.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import UTC, datetime

from agent.contracts import PlanningRequest, PlanningResult, ValidationReport, VerificationRequest
from core.models import Frame, PlanAck, PlanCommand, RiskSnapshot, Task
from planner.assemble import route_from_path
from planner.astar import plan
from planner.grid import build_grid
from planner.scene import Scene
from sim.energy import REQUIRED_NUMERIC, VehicleProfile
from validator.checks import validate_route


class M2Tools:
    def __init__(
        self,
        scene: Scene,
        snapshot_provider: Callable[[Task], RiskSnapshot],
        submitter: Callable[[PlanCommand], PlanAck | None],
        *,
        profile: VehicleProfile | None,
        is_mock: bool,
        clock: Callable[[], datetime] | None = None,
    ):
        if profile is not None:
            values = [getattr(profile, name) for name in REQUIRED_NUMERIC]
            if any(not math.isfinite(v) or v < 0 for v in values if v is not None):
                raise ValueError("Vehicle profile requires finite positive parameters")
            if any(v is None for v in values):
                raise ValueError("Vehicle profile is incomplete")
            if any(
                getattr(profile, name) <= 0
                for name in ("cruise_speed_mps", "climb_rate_mps", "energy_per_meter_wh", "usable_battery_wh")
            ):
                raise ValueError("Vehicle speed, climb rate, energy rate and capacity must be positive")
        self.scene, self.snapshot_provider, self.submitter = scene, snapshot_provider, submitter
        self.profile, self.is_mock = profile, is_mock
        self.clock = clock or (lambda: datetime.now(UTC))

    def get_snapshot(self, task: Task) -> RiskSnapshot:
        return self.snapshot_provider(task)

    def plan_route(self, request: PlanningRequest) -> PlanningResult:
        task, snapshot = request.task, request.snapshot
        if self.profile is None:
            return PlanningResult(reason="Vehicle profile missing; energy is not guessed")
        if task.vehicle_type != self.profile.vehicle_key:
            return PlanningResult(reason="Task vehicle_type does not match the supplied profile")
        if task.initial_energy_wh > self.profile.usable_battery_wh:
            return PlanningResult(reason="Initial energy exceeds this vehicle profile's usable capacity")
        if task.reserve_energy_wh < self.profile.reserve_policy_wh:
            return PlanningResult(reason="Task reserve is below this vehicle profile's reserve policy")
        if request.feedback:
            names = ", ".join(c.name for c in request.feedback)
            return PlanningResult(
                reason=f"astar_static cannot resolve validator feedback ({names}); M2 upgrade required"
            )
        if task.origin.frame is not Frame.ENU_M or task.destination.frame is not Frame.ENU_M:
            return PlanningResult(reason="M2 baseline currently requires ENU coordinates")
        # Only already-effective events are known to this baseline, as in M2.
        blockers = list(self.scene.obstacles)
        for event in snapshot.events:
            if event.kind != "restriction_zone" or event.effective_from > snapshot.captured_at:
                continue
            if event.effective_until is not None and event.effective_until <= snapshot.captured_at:
                continue
            coords = event.geometry.get("coordinates")
            if event.geometry.get("type") != "Polygon" or not coords or len(coords) != 1:
                return PlanningResult(reason="Baseline cannot represent this restriction geometry")
            blockers.append([(float(x), float(y)) for x, y in coords[0]])
        grid = build_grid(blockers, clearance_m=30)
        path = plan(grid, (task.origin.x_m, task.origin.y_m), (task.destination.x_m, task.destination.y_m))
        if not path.found:
            return PlanningResult(reason=path.reason or "No baseline path")
        # Budget is the known usable allowance, NOT a second predicted energy
        # calculation. M2 independently calculates consumption against this cap.
        budget = task.initial_energy_wh - task.reserve_energy_wh
        if budget <= 0:
            return PlanningResult(reason="Baseline produced zero-distance energy budget")
        route = route_from_path(
            path, task, snapshot, plan_version=request.plan_version, energy_budget_wh=budget
        )
        return PlanningResult(route=route)

    def verify_route(self, request: VerificationRequest) -> ValidationReport:
        if request.vehicle_state is not None:
            raise NotImplementedError(
                "M2 does not yet independently validate remaining routes from current telemetry"
            )
        return validate_route(
            request.route,
            request.task,
            request.snapshot,
            self.scene,
            profile=self.profile,
            now=self.clock(),
        )

    def submit_command(self, command: PlanCommand) -> PlanAck | None:
        return self.submitter(command)
