"""M3 orchestration ledger: SQLite locally, PostgreSQL on RDS later.

This is not M5's business task table. A unique (mode, task_id) reservation is
committed BEFORE orchestration, so another process cannot redispatch the task.
An interrupted reservation requires audit recovery, never automatic takeover.
"""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import Field
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, create_engine, insert, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from agent.contracts import AgentResult, Contract
from core.models import Task


class RunConflict(RuntimeError):
    pass


class PersistenceUnavailable(RuntimeError):
    pass


class RunRecord(Contract):
    task: Task
    run_mode: Literal["mock", "integration"]
    audit_path: str
    revision: int = Field(ge=0)
    result: AgentResult | None = None


def task_digest(task: Task) -> str:
    text = json.dumps(task.model_dump(mode="json"), sort_keys=True, allow_nan=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class RunRepository:
    def __init__(self, dsn: str):
        try:
            url = make_url(dsn)
            if url.drivername in {"postgres", "postgresql"}:
                url = url.set(drivername="postgresql+psycopg")
            if url.drivername not in {"sqlite", "postgresql+psycopg"}:
                raise ValueError("Unsupported ledger database")
            connect_args = (
                {"timeout": 5}
                if url.drivername == "sqlite"
                else {
                    "connect_timeout": 5,
                    "options": "-c statement_timeout=5000 -c lock_timeout=3000",
                }
            )
            self.engine = create_engine(
                url, pool_pre_ping=True, connect_args=connect_args, hide_parameters=True, pool_timeout=5
            )
        except Exception:
            raise ValueError("M3 ledger requires a valid SQLite or PostgreSQL DSN") from None
        self.metadata = MetaData()
        self.runs = Table(
            "m3_task_runs",
            self.metadata,
            Column("run_mode", String(16), primary_key=True),
            Column("task_id", String(256), primary_key=True),
            Column("task_digest", String(64), nullable=False),
            Column("task_json", Text, nullable=False),
            Column("audit_path", Text, nullable=False),
            Column("revision", Integer, nullable=False),
            Column("result_json", Text),
        )

    def initialize(self) -> None:
        """Explicit schema creation; construction alone does not contact RDS."""
        try:
            self.metadata.create_all(self.engine)
        except SQLAlchemyError:
            raise PersistenceUnavailable("Cannot initialize M3 task ledger") from None

    def _where(self, task_id: str, run_mode: str):
        return (self.runs.c.task_id == task_id) & (self.runs.c.run_mode == run_mode)

    def get(self, task_id: str, run_mode: Literal["mock", "integration"]) -> RunRecord | None:
        try:
            with self.engine.connect() as connection:
                row = (
                    connection.execute(select(self.runs).where(self._where(task_id, run_mode)))
                    .mappings()
                    .first()
                )
            if row is None:
                return None
            return RunRecord(
                task=Task.model_validate_json(row["task_json"]),
                run_mode=row["run_mode"],
                audit_path=row["audit_path"],
                revision=row["revision"],
                result=AgentResult.model_validate_json(row["result_json"]) if row["result_json"] else None,
            )
        except SQLAlchemyError:
            raise PersistenceUnavailable("Cannot read M3 task ledger") from None

    def claim(
        self, task: Task, run_mode: Literal["mock", "integration"], audit_path: str
    ) -> tuple[RunRecord, bool]:
        if not task.task_id.strip() or len(task.task_id) > 256 or run_mode not in {"mock", "integration"}:
            raise ValueError("Invalid task identity or run mode")
        digest = task_digest(task)
        try:
            with self.engine.begin() as connection:
                connection.execute(
                    insert(self.runs).values(
                        run_mode=run_mode,
                        task_id=task.task_id,
                        task_digest=digest,
                        task_json=task.model_dump_json(),
                        audit_path=audit_path,
                        revision=0,
                    )
                )
        except IntegrityError:
            existing = self.get(task.task_id, run_mode)
            if existing is None or task_digest(existing.task) != digest:
                raise RunConflict("Task ID already reserved for different task content") from None
            return existing, False
        except SQLAlchemyError:
            raise PersistenceUnavailable("Cannot reserve task; no command may be submitted") from None
        return RunRecord(task=task, run_mode=run_mode, audit_path=audit_path, revision=0), True

    def save_result(self, record: RunRecord, result: AgentResult) -> RunRecord:
        if (result.task_id, result.run_mode, result.audit_path) != (
            record.task.task_id,
            record.run_mode,
            record.audit_path,
        ):
            raise RunConflict("Result does not belong to this task reservation")
        if record.result is not None and result.run_id != record.result.run_id:
            raise RunConflict("Cannot replace a task with a different execution run")
        try:
            with self.engine.begin() as connection:
                changed = connection.execute(
                    update(self.runs)
                    .where(
                        self._where(result.task_id, result.run_mode)
                        & (self.runs.c.revision == record.revision)
                        & (self.runs.c.task_digest == task_digest(record.task))
                        & (self.runs.c.audit_path == record.audit_path)
                    )
                    .values(result_json=result.model_dump_json(), revision=record.revision + 1)
                )
                if changed.rowcount != 1:
                    raise RunConflict("Task revision changed; reload instead of overwriting")
        except SQLAlchemyError:
            raise PersistenceUnavailable(
                "Cannot persist result; recover the original audit, do not rerun"
            ) from None
        return RunRecord(
            task=record.task,
            run_mode=record.run_mode,
            audit_path=record.audit_path,
            revision=record.revision + 1,
            result=result,
        )

    def close(self):
        self.engine.dispose()
