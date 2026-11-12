"""M3 工具接口与本地契约。共享数据模型以 core/models.py 为准，本文件不复制它们。

`route_digest` 从 core 再导出，保持 `from agent.contracts import route_digest` 的老写法可用。
它本身属于 RoutePlan 的属性，实现放在 core，避免规划侧和校验侧各算一份摘要。
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, model_validator

from core.models import (
    ConstraintCheck,
    PlanAck,
    PlanCommand,
    RiskSnapshot,
    RoutePlan,
    Task,
    VehicleState,
)
from core.models import (
    route_digest as route_digest,  # 再导出，保持老导入路径可用
)

REQUIRED_CHECKS = ("restriction_zone", "clearance", "diversion_reachability", "energy")


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
