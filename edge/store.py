"""SQLite 持久化：命令去重、执行记录、重启恢复。

为什么不用 SQLAlchemy：执行端要能在没装 `requirements-m3.txt` 的环境里独立跑，
标准库 `sqlite3` 足够。并发安全靠 `BEGIN IMMEDIATE` + 主键唯一，不靠进程内锁
（进程内锁只用来串行化同一连接上的写，不能跨进程）。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from threading import RLock

from agent.guards import version_number
from core.models import PlanAck, PlanCommand
from edge.contracts import CommandVerdict, ExecutionRecord, RecordState, RunMode

_SCHEMA = """
CREATE TABLE IF NOT EXISTS edge_commands (
    command_id      TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL,
    plan_version    TEXT NOT NULL,
    run_mode        TEXT NOT NULL,
    command_json    TEXT NOT NULL,
    state           TEXT NOT NULL,
    ack_json        TEXT,
    accepted_at     TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    execution_count INTEGER NOT NULL DEFAULT 0,
    last_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_edge_state ON edge_commands(state);
"""


class CommandStore:
    """一个 command_id 只允许落一条记录；重复投递必须能被识别出来。"""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._closed = False
        self._conn = sqlite3.connect(self.path, timeout=10, isolation_level=None, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(_SCHEMA)

    # ---------------------------------------------------------------- 写入
    def claim(
        self, command: PlanCommand, now: datetime, run_mode: RunMode, *, enforce_single_vehicle: bool = False
    ) -> tuple[CommandVerdict, ExecutionRecord]:
        """原子占用一个 command_id。并发调用只有一个能拿到 accepted=True。"""
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("BEGIN IMMEDIATE")
            try:
                row = cursor.execute(
                    "SELECT * FROM edge_commands WHERE command_id = ?", (command.command_id,)
                ).fetchone()
                if row is not None:
                    existing = self._record(row)
                    cursor.execute("COMMIT")
                    if existing.command != command:
                        return (
                            CommandVerdict(
                                accepted=False,
                                reason="command_id 已被不同内容占用，拒绝覆盖",
                                reject_code="duplicate_conflict",
                                existing=existing,
                            ),
                            existing,
                        )
                    return (
                        CommandVerdict(
                            accepted=False,
                            reason="重复投递，返回原记录",
                            reject_code="duplicate_same",
                            existing=existing,
                        ),
                        existing,
                    )
                verdict = CommandVerdict(accepted=True, reason="已接受")
                if enforce_single_vehicle:
                    # This database belongs to ONE vehicle. The transaction is
                    # the lock across threads, services and process restarts.
                    rows = cursor.execute("SELECT * FROM edge_commands").fetchall()
                    records = [self._record(item) for item in rows]
                    for previous in records:
                        if previous.task_id == command.task_id and version_number(
                            command.plan_version
                        ) <= version_number(previous.plan_version):
                            verdict = CommandVerdict(
                                accepted=False,
                                reason="拒绝旧版本或复用已占用版本",
                                reject_code="stale_version",
                            )
                            break
                    for previous in records:
                        if verdict.accepted and previous.state in {"accepted", "executing", "recovering"}:
                            verdict = CommandVerdict(
                                accepted=False,
                                reason="执行端已有活动命令或待对账命令，禁止并行启动",
                                reject_code="vehicle_busy",
                            )
                            break
                rejection = (
                    None
                    if verdict.accepted
                    else PlanAck(
                        command_id=command.command_id,
                        task_id=command.task_id,
                        plan_version=command.plan_version,
                        received_at=now,
                        accepted=False,
                        reject_reason=verdict.reason,
                    )
                )
                record = ExecutionRecord(
                    command_id=command.command_id,
                    task_id=command.task_id,
                    plan_version=command.plan_version,
                    run_mode=run_mode,
                    command=command,
                    state="accepted" if verdict.accepted else "rejected",
                    ack=rejection,
                    last_reason=None if verdict.accepted else verdict.reason,
                    accepted_at=now,
                    updated_at=now,
                )
                cursor.execute(
                    "INSERT INTO edge_commands (command_id, task_id, plan_version, run_mode,"
                    " command_json, state, ack_json, accepted_at, updated_at, execution_count,"
                    " last_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
                    (
                        record.command_id,
                        record.task_id,
                        record.plan_version,
                        record.run_mode,
                        command.model_dump_json(),
                        record.state,
                        rejection.model_dump_json() if rejection else None,
                        now.isoformat(),
                        now.isoformat(),
                        record.last_reason,
                    ),
                )
                cursor.execute("COMMIT")
                return verdict, record
            except Exception:
                try:
                    cursor.execute("ROLLBACK")
                except sqlite3.Error:
                    pass  # 事务可能已经结束，别让回滚错误掩盖真正的异常
                raise

    def mark_executing(self, command_id: str, now: datetime) -> None:
        with self._lock:
            cursor = self._conn.execute(
                "UPDATE edge_commands SET state = 'executing', execution_count = execution_count + 1,"
                " updated_at = ? WHERE command_id = ?",
                (now.isoformat(), command_id),
            )
            if cursor.rowcount == 0:
                raise KeyError(f"命令不存在：{command_id}")

    def finish(
        self,
        command_id: str,
        state: RecordState,
        now: datetime,
        *,
        ack: PlanAck | None = None,
        reason: str | None = None,
    ) -> None:
        with self._lock:
            cursor = self._conn.execute(
                "UPDATE edge_commands SET state = ?, ack_json = ?, updated_at = ?, last_reason = ?"
                " WHERE command_id = ?",
                (
                    state,
                    ack.model_dump_json() if ack else None,
                    now.isoformat(),
                    reason,
                    command_id,
                ),
            )
            if cursor.rowcount == 0:
                raise KeyError(f"命令不存在：{command_id}")

    def mark_recovering(self, command_id: str, now: datetime, reason: str) -> None:
        with self._lock:
            cursor = self._conn.execute(
                "UPDATE edge_commands SET state = 'recovering', updated_at = ?, last_reason = ?"
                " WHERE command_id = ?",
                (now.isoformat(), reason, command_id),
            )
            if cursor.rowcount == 0:
                raise KeyError(f"命令不存在：{command_id}")

    # ---------------------------------------------------------------- 读取
    def get(self, command_id: str) -> ExecutionRecord | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM edge_commands WHERE command_id = ?", (command_id,)
            ).fetchone()
        return self._record(row) if row else None

    def pending(self) -> list[ExecutionRecord]:
        """未完成的记录：accepted / executing / recovering，用于重启后对账。"""
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM edge_commands WHERE state IN ('accepted','executing','recovering')"
                " ORDER BY accepted_at, command_id"
            ).fetchall()
        return [self._record(row) for row in rows]

    def all(self) -> list[ExecutionRecord]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM edge_commands ORDER BY accepted_at, command_id"
            ).fetchall()
        return [self._record(row) for row in rows]

    def count(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS n FROM edge_commands").fetchone()
        return int(row["n"])

    # ---------------------------------------------------------------- 生命周期
    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            self._conn.close()

    def __enter__(self) -> CommandStore:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # ---------------------------------------------------------------- 内部
    @staticmethod
    def _record(row: sqlite3.Row) -> ExecutionRecord:
        return ExecutionRecord(
            command_id=row["command_id"],
            task_id=row["task_id"],
            plan_version=row["plan_version"],
            run_mode=row["run_mode"],
            command=PlanCommand.model_validate_json(row["command_json"]),
            state=row["state"],
            ack=PlanAck.model_validate_json(row["ack_json"]) if row["ack_json"] else None,
            accepted_at=datetime.fromisoformat(row["accepted_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            execution_count=row["execution_count"],
            last_reason=row["last_reason"],
        )
