"""M3-local contracts; shared core/models.py remains unchanged."""

from __future__ import annotations

import hashlib
from datetime import datetime
from enum import StrEnum
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, model_validator

from core.models import ConstraintCheck, PlanAck, PlanCommand, RiskSnapshot, RoutePlan, Task, VehicleState

REQUIRED_CHECKS = ("restriction_zone", "clearance", "diversion_reachability", "energy")


def route_digest(route: RoutePlan) -> str:
    """Bind a validation report to the exact candidate, not just its label."""
    import json

    encoded = json.dumps(
        route.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, validate_assignment=True)


class AgentStatus(StrEnum):
    CREATED = "created"
    SNAPSHOT = "reading_snapshot"
    PLANNING = "planning"
    VERIFYING = "verifying"
    WAITING_ACK = "waiting_ack"
    ACKNOWLEDGED = "acknowledged"  # accepted command != completed flight
    REJECTED = "rejected"
    BLOCKED = "blocked"
    ERROR = "error"


class AgentPolicy(Contract):
    max_plan_attempts: int = Field(default=3, ge=1, le=20)
    max_snapshot_refreshes: int = Field(default=1, ge=0, le=10)
    command_ttl_s: float = Field(default=30, gt=0, le=300)


class PlanningRequest(Contract):
    task: Task
    snapshot: RiskSnapshot
    plan_version: str
    attempt: int = Field(ge=1)
    feedback: list[ConstraintCheck] = Field(default_factory=list)


class PlanningResult(Contract):
    route: RoutePlan | None = None
    reason: str | None = None

    @model_validator(mode="after")
    def explain_no_route(self) -> PlanningResult:
        if self.route is None and not (self.reason and self.reason.strip()):
            raise ValueError("A missing route must have an explicit reason")
        return self


class VerificationRequest(Contract):
    task: Task
    route: RoutePlan
    snapshot: RiskSnapshot
    vehicle_state: VehicleState | None = None


class ValidationReport(Contract):
    task_id: str
    route_id: str
    plan_version: str
    snapshot_id: str
    route_digest: str
    verified_at: datetime
    vehicle_state_ts: datetime | None = None
    checks: list[ConstraintCheck]


class AgentTools(Protocol):
    """Implementations must use bounded I/O timeouts. No default real adapters.

    verify_route must independently recompute constraints, never copy
    RoutePlan.checks. submit_command submits once; a timeout is an UNKNOWN
    delivery outcome and must not cause a fresh command/version automatically.
    """

    is_mock: bool

    def get_snapshot(self, task: Task) -> RiskSnapshot: ...

    def plan_route(self, request: PlanningRequest) -> PlanningResult: ...

    def verify_route(self, request: VerificationRequest) -> ValidationReport: ...

    def submit_command(self, command: PlanCommand) -> PlanAck | None: ...


class AgentResult(Contract):
    run_id: str
    task_id: str
    run_mode: Literal["mock", "integration"]
    is_simulated: bool
    status: AgentStatus = AgentStatus.CREATED
    reason: str = "Created"
    plan_attempts: int = 0
    snapshot_refreshes: int = 0
    route: RoutePlan | None = None
    command: PlanCommand | None = None
    ack: PlanAck | None = None
    audit_path: str
