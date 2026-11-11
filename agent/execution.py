"""Execution feedback is separate from command acceptance and vehicle telemetry."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from agent.contracts import Contract


class ExecutionStatus(Contract):
    command_id: str
    task_id: str
    plan_version: str
    state: Literal["accepted", "executing", "completed", "failed", "rejected", "recovering"]
    updated_at: datetime
    execution_count: int = Field(ge=0)
    reason: str | None = None
