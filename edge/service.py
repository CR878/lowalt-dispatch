"""EdgeService：收命令 → 准入 → 去重 → 执行 → ACK → 遥测 → 落库。

一次 `submit()` 只做"受理"，真正推进靠 `tick()`。这样上层（MQTT 回调、定时器、
demo）都能用同一个同步核心，不必把网络循环塞进来。
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from uuid import uuid4

from core.models import PlanAck, PlanCommand
from edge.audit import AuditWriter
from edge.contracts import RunMode
from edge.executor import Executor, ExecutorError, FakeExecutor, parse_waypoints
from edge.guard import check_command
from edge.store import CommandStore
from edge.telemetry import TelemetryWriter, make_observation


class EdgeService:
    def __init__(
        self,
        store: CommandStore,
        *,
        audit_path: Path | str,
        telemetry_path: Path | str,
        run_mode: RunMode = "mock",
        clock: Callable[[], datetime] | None = None,
        executor_factory: Callable[[list[tuple[float, float, float]]], Executor] | None = None,
        task_id: str | None = None,
    ) -> None:
        self.store = store
        self.run_mode = run_mode
        self.clock = clock or (lambda: datetime.now(UTC))
        self.task_id = task_id
        self.run_id = uuid4().hex
        self.audit = AuditWriter(audit_path)
        self.telemetry = TelemetryWriter(telemetry_path)
        self._factory: Callable[[list[tuple[float, float, float]]], Executor] = executor_factory or (
            lambda points: FakeExecutor(points)
        )
        self._active: dict[str, tuple[Executor, PlanCommand]] = {}
        self._closed = False
        self._lock = RLock()
        self._last_moment: datetime | None = None

    # ---------------------------------------------------------------- 受理
    def submit(self, command: PlanCommand) -> PlanAck:
        self._ensure_open()
        now = self.clock()
        verdict = check_command(command, now, run_mode=self.run_mode, expected_task_id=self.task_id)
        if not verdict.accepted:
            self._audit(
                "command_rejected",
                command=command,
                reason=verdict.reason,
                code=verdict.reject_code,
            )
            return self._reject_ack(command, now, verdict.reason)

        duplicate, record = self.store.claim(command, now, self.run_mode)
        if not duplicate.accepted:
            self._audit(
                "command_duplicate",
                command=command,
                reason=duplicate.reason,
                code=duplicate.reject_code,
            )
            if duplicate.reject_code == "duplicate_same":
                if record.ack is not None:
                    return record.ack
                # 原记录还没产出 ACK：上次可能停在启动前，标恢复中，不自动补跑。
                self.store.mark_recovering(record.command_id, now, "重复投递时发现原记录未完成")
                return PlanAck(
                    command_id=record.command_id,
                    task_id=record.task_id,
                    plan_version=record.plan_version,
                    received_at=now,
                    accepted=True,
                    reject_reason=None,
                    fc_mode="RECOVERING",
                )
            return self._reject_ack(command, now, duplicate.reason)

        try:
            points = parse_waypoints(command.payload)
            executor = self._factory(points)
            mode = executor.start(command, now)
        except (ExecutorError, ValueError) as exc:
            self.store.finish(command.command_id, "failed", now, reason=str(exc))
            self._audit("executor_failed", command=command, reason=str(exc))
            return self._reject_ack(command, now, str(exc))

        ack = PlanAck(
            command_id=command.command_id,
            task_id=command.task_id,
            plan_version=command.plan_version,
            received_at=now,
            accepted=True,
            reject_reason=None,
            fc_mode=mode,
        )
        self.store.mark_executing(command.command_id, now)
        self.store.finish(command.command_id, "executing", now, ack=ack, reason="executor started")
        with self._lock:
            self._active[command.command_id] = (executor, command)
            self._last_moment = now
        self._audit("command_accepted", command=command, fc_mode=mode)
        return ack

    # ---------------------------------------------------------------- 推进
    def tick(self, now: datetime | None = None):
        self._ensure_open()
        moment = now or self.clock()
        with self._lock:
            if self._last_moment is not None and moment < self._last_moment:
                raise ValueError("tick 时间倒退：执行端不接受回退的时钟")
            self._last_moment = moment
            active = list(self._active.items())
        produced: list = []
        for command_id, (executor, command) in active:
            try:
                state = executor.sample(moment)
            except Exception as exc:
                # 执行器可能抛 ExecutorError，也可能抛别的东西（驱动异常、编码错误）。
                # 一律按失败落库，不能让一条命令把整个 tick 循环带崩。
                self.store.finish(command_id, "failed", moment, reason=f"{type(exc).__name__}: {exc}")
                with self._lock:
                    self._active.pop(command_id, None)
                self._audit("sample_failed", command_id=command_id, reason=f"{type(exc).__name__}: {exc}")
                continue
            observation = make_observation(
                task_id=command.task_id,
                state=state,
                accepted_command_id=command_id,
                received_at=moment,
            )
            self.telemetry.append(observation)
            produced.append(observation)
            if executor.is_done(moment):
                record = self.store.get(command_id)
                self.store.finish(
                    command_id,
                    "completed",
                    moment,
                    ack=record.ack if record else None,
                    reason="mission finished",
                )
                with self._lock:
                    self._active.pop(command_id, None)
                self._audit("mission_completed", command_id=command_id, task_id=command.task_id)
        return produced

    def run_to_completion(self, command: PlanCommand, *, step_s: float = 1.0, max_ticks: int = 10000):
        ack = self.submit(command)
        if not ack.accepted:
            return ack, []
        base = self.clock()
        samples: list = []
        for index in range(1, max_ticks + 1):
            samples.extend(self.tick(base + timedelta(seconds=index * step_s)))
            with self._lock:
                still_active = command.command_id in self._active
            if not still_active:
                break
        else:
            record = self.store.get(command.command_id)
            if record is not None and record.state in {"accepted", "executing"}:
                deadline = base + timedelta(seconds=max_ticks * step_s)
                self.store.finish(
                    command.command_id,
                    "failed",
                    deadline,
                    ack=record.ack,
                    reason=f"超出 {max_ticks} 次 tick 仍未完成，标记失败等待人工对账",
                )
                self._active.pop(command.command_id, None)
                self._audit("mission_timeout", command_id=command.command_id)
        return ack, samples

    # ---------------------------------------------------------------- 恢复
    def recover(self) -> list[str]:
        """进程重启后把未完成记录标成 recovering，不重放、不重发。"""
        self._ensure_open()
        now = self.clock()
        with self._lock:
            active_ids = set(self._active)
        recovered: list[str] = []
        for record in self.store.pending():
            if record.command_id in active_ids:
                continue
            self.store.mark_recovering(record.command_id, now, "进程重启：不重新执行，等待对账")
            self._audit(
                "recovered_pending",
                command_id=record.command_id,
                task_id=record.task_id,
                prior_state=record.state,
            )
            recovered.append(record.command_id)
        return recovered

    # ---------------------------------------------------------------- 收尾
    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.audit.close()
        self.telemetry.close()

    def __enter__(self) -> EdgeService:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # ---------------------------------------------------------------- 内部
    def _ensure_open(self) -> None:
        if self._closed:
            raise RuntimeError("EdgeService 已关闭；重建实例或重新打开 store")

    def _audit(self, event: str, **fields: object) -> None:
        self.audit.append(
            ts=self.clock(),
            event=event,
            run_id=self.run_id,
            run_mode=self.run_mode,
            **fields,
        )

    @staticmethod
    def _reject_ack(command: PlanCommand, now: datetime, reason: str) -> PlanAck:
        return PlanAck(
            command_id=command.command_id,
            task_id=command.task_id,
            plan_version=command.plan_version,
            received_at=now,
            accepted=False,
            reject_reason=reason,
            fc_mode=None,
        )
