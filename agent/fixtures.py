"""Explicitly MOCK adapters for decision tests; no physical safety computation.

These fixtures never read or replace planner/, sim/, scenarios/vehicles/ or PX4.
Their numeric values are synthetic test inputs and must not enter effect claims.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from agent.contracts import (
    REQUIRED_CHECKS,
    PlanningRequest,
    PlanningResult,
    ValidationReport,
    VerificationRequest,
    route_digest,
)
from agent.edge_decisions import CachedFallback, ExecutionObservation
from core.models import (
    ConstraintCheck,
    DataProvenance,
    PlanAck,
    PlanCommand,
    Position,
    RiskSnapshot,
    RoutePlan,
    Task,
    VehicleState,
)


def fixture_task(now: datetime) -> Task:
    return Task(
        task_id="MOCK-TASK-001",
        vehicle_type="MOCK-NOT-A-REAL-VEHICLE",
        payload_kg=0,
        initial_energy_wh=100,
        reserve_energy_wh=10,
        origin=Position(frame="enu_m", x_m=0, y_m=0, alt_m=30, alt_ref="rel_takeoff"),
        destination=Position(frame="enu_m", x_m=100, y_m=0, alt_m=30, alt_ref="rel_takeoff"),
        provenance=DataProvenance(
            source="mock:agent_control_flow_fixture", version="1", captured_at=now, is_simulated=True
        ),
    )


class FixtureTools:
    is_mock = True

    def __init__(self, scenario: str = "normal", *, clock: Callable[[], datetime] | None = None) -> None:
        self.scenario = scenario
        self.clock = clock or (lambda: datetime.now(UTC))
        self.snapshots_read = 0
        self.requests: list[PlanningRequest] = []
        self.verifications: list[VerificationRequest] = []
        self.submitted: list[PlanCommand] = []

    def get_snapshot(self, task: Task) -> RiskSnapshot:
        self.snapshots_read += 1
        now = self.clock()
        expired = self.scenario == "stale" and self.snapshots_read == 1
        return RiskSnapshot(
            snapshot_id=f"MOCK-S{self.snapshots_read}",
            captured_at=now - timedelta(seconds=5),
            valid_until=now + timedelta(seconds=-1 if expired else 120),
            note="MOCK: no real geometry or safety data",
        )

    def plan_route(self, request: PlanningRequest) -> PlanningResult:
        self.requests.append(request.model_copy(deep=True))
        if self.scenario == "no_route":
            return PlanningResult(reason="MOCK fixture: planner reports no feasible candidate")
        return PlanningResult(
            route=RoutePlan(
                route_id=f"MOCK-R{request.attempt}",
                plan_version=request.plan_version,
                snapshot_id=request.snapshot.snapshot_id,
                algorithm="MOCK_fixture_not_a_planner",
                waypoints=[request.task.origin, request.task.destination],
                energy_budget_wh=20,
                diversion_site_id="MOCK-L1",
                valid_until=request.snapshot.valid_until,
                checks=[
                    ConstraintCheck(name="planner_claim", passed=True, detail="Self-report must be ignored")
                ],
            )
        )

    def verify_route(self, request: VerificationRequest) -> ValidationReport:
        self.verifications.append(request.model_copy(deep=True))
        fail_first = self.scenario == "replan" and len(self.verifications) == 1
        checks = [
            ConstraintCheck(
                name=name,
                passed=not (fail_first and name == "diversion_reachability"),
                detail="MOCK fixture rejection: diversion margin unavailable"
                if fail_first and name == "diversion_reachability"
                else "MOCK fixture response; NOT a real safety check",
            )
            for name in REQUIRED_CHECKS
        ]
        if self.scenario == "missing_check":
            checks = [c for c in checks if c.name != "energy"]
        return ValidationReport(
            task_id=request.task.task_id,
            route_id=request.route.route_id,
            plan_version=request.route.plan_version,
            snapshot_id=request.snapshot.snapshot_id,
            route_digest=route_digest(request.route),
            verified_at=self.clock(),
            checks=checks,
            vehicle_state_ts=request.vehicle_state.ts if request.vehicle_state else None,
        )

    def submit_command(self, command: PlanCommand) -> PlanAck | None:
        self.submitted.append(command.model_copy(deep=True))
        if self.scenario == "ack_timeout":
            raise TimeoutError("MOCK lost response; acceptance is unknown")
        return PlanAck(
            command_id=command.command_id,
            task_id=command.task_id,
            plan_version="v999" if self.scenario == "mismatched_ack" else command.plan_version,
            received_at=self.clock(),
            accepted=True,
            fc_mode="MOCK-NO-FLIGHT-CONTROLLER",
        )

    def fallback_fixture(self) -> tuple[Task, ExecutionObservation, CachedFallback]:
        now = self.clock()
        task = fixture_task(now)
        snapshot = self.get_snapshot(task)
        proposal = self.plan_route(
            PlanningRequest(task=task, snapshot=snapshot, plan_version="v2", attempt=2)
        )
        assert proposal.route is not None
        report = self.verify_route(VerificationRequest(task=task, route=proposal.route, snapshot=snapshot))
        observation = ExecutionObservation(
            task_id=task.task_id,
            received_at=now,
            accepted_command_id="MOCK-CMD-v1",
            state=VehicleState(
                ts=now,
                position=task.origin,
                energy_remaining_wh=80,
                flight_mode="MOCK",
                executing_plan_version="v1",
                provenance=task.provenance,
            ),
        )
        return (
            task,
            observation,
            CachedFallback(
                task_id=task.task_id,
                based_on_plan_version="v1",
                cached_at=self.clock(),
                route=proposal.route,
                snapshot=snapshot,
                validation=report,
            ),
        )
