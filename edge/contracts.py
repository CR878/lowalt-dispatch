"""执行端内部类型。公共契约（命令 / ACK / 遥测）仍以 core/models.py 为准。

这里只放"边缘端自己需要记什么"：一条命令落库后的记录、准入判定结果、审计事件。
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from agent.contracts import Contract
from core.models import PlanAck, PlanCommand

RunMode = Literal["mock", "integration"]

RecordState = Literal["accepted", "executing", "completed", "failed", "rejected", "recovering"]

RejectCode = Literal[
    "expired",
    "not_yet_valid",
    "duplicate_same",
    "duplicate_conflict",
    "mode_mismatch",
    "task_mismatch",
    "payload_invalid",
]


class ExecutionRecord(Contract):
    """一个 command_id 在边缘端只有一条记录，重启后必须能读回。"""

    command_id: str
    task_id: str
    plan_version: str
    run_mode: RunMode
    command: PlanCommand = Field(description="原样保存，恢复时用来对账，不允许改动")
    state: RecordState = "accepted"
    ack: PlanAck | None = None
    accepted_at: datetime
    updated_at: datetime
    execution_count: int = Field(default=0, ge=0, description="实际调用执行器的次数，去重断言靠它")
    last_reason: str | None = None


class CommandVerdict(Contract):
    """准入判定。拒绝也带 code 和 reason，直接进 ACK 与审计。"""

    accepted: bool
    reason: str
    reject_code: RejectCode | None = None
    existing: ExecutionRecord | None = Field(
        default=None, description="duplicate_same 时指向原记录，调用方应直接返回它的 ACK"
    )


class EdgeEvent(Contract):
    """审计事件，按行写 JSONL。"""

    ts: datetime
    event: str
    command_id: str | None = None
    task_id: str | None = None
    detail: str | None = None
