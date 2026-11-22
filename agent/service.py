"""Framework-independent M3 entry points for M5's future API.

Persistent reservation precedes all tools. Redis/OBS are optional projections;
their failure cannot cause command resubmission or erase the local audit.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from agent.archive import AuditObjectStore, archive_run
from agent.contracts import AgentTools
from agent.engine import TaskAgent
from agent.projection import RedisProjection
from agent.repository import RunRecord, RunRepository
from core.models import PlanAck, Task


class RecoveryRequired(RuntimeError):
    pass


class TaskService:
    def __init__(
        self,
        tools: AgentTools,
        repository: RunRepository,
        audit_dir: Path,
        *,
        projection: RedisProjection | None = None,
        archive: AuditObjectStore | None = None,
        clock: Callable[[], datetime] | None = None,
    ):
        self.tools, self.repository, self.audit_dir = tools, repository, Path(audit_dir)
        self.projection, self.archive, self.clock = projection, archive, clock
        self.run_mode = "mock" if tools.is_mock else "integration"
        self.last_sync_errors: list[str] = []

    def run(self, task: Task) -> RunRecord:
        task = Task.model_validate_json(task.model_dump_json())
        # Random filenames avoid task-id path traversal and accidental log reuse.
        suffix = "_MOCK" if self.run_mode == "mock" else ""
        path = str((self.audit_dir / f"{uuid4().hex}{suffix}.jsonl").resolve())
        record, owned = self.repository.claim(task, self.run_mode, path)
        if not owned:
            if record.result is None:
                raise RecoveryRequired(
                    "Task already reserved; recover its original audit instead of rerunning"
                )
            return record
        with TaskAgent(self.tools, Path(record.audit_path), clock=self.clock) as agent:
            result = agent.run(task)
        saved = self.repository.save_result(record, result)
        self.sync(saved)
        return saved

    def recover(self, task_id: str, ack: PlanAck | None = None) -> RunRecord:
        record = self.repository.get(task_id, self.run_mode)
        if record is None:
            raise KeyError("Unknown task")
        with TaskAgent.restore(self.tools, Path(record.audit_path), clock=self.clock) as agent:
            result = agent.accept_ack(ack) if ack is not None else agent.result
        saved = self.repository.save_result(record, result)
        self.sync(saved)
        return saved

    def sync(self, record: RunRecord) -> list[str]:
        """Idempotent retry of projections only, never tools or dispatch."""
        self.last_sync_errors = []
        if self.projection is not None:
            try:
                self.projection.publish(record)
            except Exception:
                self.last_sync_errors.append("dcs_projection_failed")
        if self.archive is not None:
            try:
                archive_run(record, self.archive)
            except Exception:
                self.last_sync_errors.append("audit_archive_failed")
        return list(self.last_sync_errors)
