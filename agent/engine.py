"""Bounded, tool-result-driven M3 decision loop. No direct flight control."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import Any, TypeVar
from uuid import uuid4

from pydantic import BaseModel

from agent.audit import AuditError, JsonlAudit
from agent.contracts import (
    AgentPolicy,
    AgentResult,
    AgentStatus,
    AgentTools,
    PlanningRequest,
    PlanningResult,
    ValidationReport,
    VerificationRequest,
)
from agent.guards import report_failures, route_problem, snapshot_problem, task_problem, utc
from agent.recovery import recover_result
from core.models import ConstraintCheck, PlanAck, PlanCommand, RiskSnapshot, Task

T = TypeVar("T", bound=BaseModel)


class CommandNotSubmitted(RuntimeError):
    """Expired before transport call; unlike a transport timeout, delivery is known."""


class TaskAgent:
    """One task per instance. Use accept_ack() after a lost/delayed response.

    This is a rule-driven decision kernel, not an LLM-connected application.
    Task completion and telemetry reconciliation belong to later integration.
    """

    def __init__(
        self,
        tools: AgentTools,
        audit_path: Path,
        *,
        policy: AgentPolicy | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.tools = tools
        self.policy = policy or AgentPolicy()
        self.clock = clock or (lambda: datetime.now(UTC))
        self.audit_path = Path(audit_path)
        self._audit: JsonlAudit | None = None
        self._result: AgentResult | None = None
        self._snapshot: RiskSnapshot | None = None
        self._submission_attempted = False
        self._mutex = RLock()
        self._closed = False

    @classmethod
    def restore(
        cls,
        tools: AgentTools,
        audit_path: Path,
        *,
        clock: Callable[[], datetime] | None = None,
        repair_tail: bool = False,
    ) -> TaskAgent:
        """Reopen a stopped run for ACK handling only; never repeat side effects.

        A live writer must close first. A torn final JSON row is rejected unless
        repair_tail=True, which preserves that fragment before truncating it.
        """
        instance = cls(tools, audit_path, clock=clock)
        restored = None

        def validate(records):
            nonlocal restored
            result, policy, attempted, interrupted = recover_result(records, Path(audit_path))
            expected = "mock" if tools.is_mock else "integration"
            if result.run_mode != expected:
                raise ValueError("Recovery cannot mix MOCK and integration tool adapters")
            if any(utc(datetime.fromisoformat(r["ts"])) > instance._now() for r in records):
                raise ValueError("Recovery clock is behind the recorded audit trail")
            restored = result, policy, attempted, interrupted

        audit, _, backup = JsonlAudit.resume(audit_path, repair_tail=repair_tail, validate=validate)
        instance._audit = audit
        try:
            assert restored is not None
            result, policy, attempted, interrupted = restored
            instance._result, instance.policy = result, policy
            instance._submission_attempted = attempted
            for call_id, tool in interrupted.items():
                instance._emit(
                    "tool_interrupted",
                    call_id=call_id,
                    tool=tool,
                    reason="Process restarted; tool not replayed and delivery not inferred",
                )
            instance._emit("run_restored", result=result, torn_tail_backup=backup)
            return instance
        except BaseException:
            instance.close()
            raise

    def close(self) -> None:
        with self._mutex:
            self._closed = True
            if self._audit is not None:
                self._audit.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    @property
    def result(self) -> AgentResult:
        with self._mutex:
            if self._result is None:
                raise RuntimeError("Task has not started")
            return self._result.model_copy(deep=True)

    def _now(self) -> datetime:
        return utc(self.clock())

    def _emit(self, event: str, **payload: Any) -> None:
        assert self._audit is not None and self._result is not None
        self._audit.append(
            event=event,
            ts=self._now(),
            run_id=self._result.run_id,
            task_id=self._result.task_id,
            run_mode=self._result.run_mode,
            is_simulated=self._result.is_simulated,
            **payload,
        )

    def _move(self, status: AgentStatus, reason: str) -> None:
        assert self._result is not None
        self._emit("state_changed", previous=self._result.status, status=status, reason=reason)
        self._result.status, self._result.reason = status, reason

    def _call(self, name: str, args: BaseModel, output: type[T], *, nullable: bool = False) -> T | None:
        call_id = uuid4().hex
        self._emit("tool_started", call_id=call_id, tool=name, input=args)
        started = time.perf_counter()
        try:
            if name == "submit_command":
                if self._now() >= args.expires_at:
                    raise CommandNotSubmitted("Command expired before the transport call")
                self._submission_attempted = True
            # Adapters cannot accidentally mutate the orchestration state.
            value = getattr(self.tools, name)(args.model_copy(deep=True))
            if value is None and nullable:
                parsed = None
            else:
                parsed = output.model_validate(value).model_copy(deep=True)
        except AuditError:
            raise
        except Exception as exc:
            self._emit("tool_failed", call_id=call_id, tool=name, error_type=type(exc).__name__)
            raise
        self._emit(
            "tool_completed",
            call_id=call_id,
            tool=name,
            output=parsed,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )
        return parsed

    def _read_snapshot(self, task: Task) -> bool:
        assert self._result is not None
        while True:
            self._move(AgentStatus.SNAPSHOT, "Read a risk snapshot")
            snapshot = self._call("get_snapshot", task, RiskSnapshot)
            assert snapshot is not None
            problem = snapshot_problem(snapshot, self._now())
            if problem is None:
                self._snapshot = snapshot
                return True
            self._emit("snapshot_rejected", snapshot_id=snapshot.snapshot_id, reason=problem)
            if not self._reserve_refresh():
                self._move(AgentStatus.BLOCKED, problem + "; snapshot refresh limit reached")
                return False

    def _reserve_refresh(self) -> bool:
        assert self._result is not None
        if self._result.snapshot_refreshes >= self.policy.max_snapshot_refreshes:
            return False
        self._result.snapshot_refreshes += 1
        self._snapshot = None
        return True

    def _refresh_expired(self, task: Task) -> bool:
        assert self._snapshot is not None
        problem = snapshot_problem(self._snapshot, self._now())
        if problem is None:
            return False
        self._emit("snapshot_rejected", snapshot_id=self._snapshot.snapshot_id, reason=problem)
        if self._reserve_refresh():
            self._read_snapshot(task)
        else:
            self._move(AgentStatus.BLOCKED, problem + "; snapshot refresh limit reached")
        return True

    def run(self, task: Task) -> AgentResult:
        with self._mutex:
            if self._closed:
                raise RuntimeError("Agent is closed")
            return self._start(task)

    def _start(self, task: Task) -> AgentResult:
        if self._result is not None:
            raise RuntimeError("One TaskAgent instance handles one task; do not resubmit a run")
        task = task.model_copy(deep=True)
        self._result = AgentResult(
            run_id=uuid4().hex,
            task_id=task.task_id,
            run_mode="mock" if self.tools.is_mock else "integration",
            is_simulated=task.provenance.is_simulated,
            audit_path=str(self.audit_path),
        )
        self._audit = JsonlAudit(self.audit_path)
        self._emit("run_started", task=task, policy=self.policy)
        try:
            self._run(task)
        except AuditError:
            # Persisting a transition/intent is a precondition for submission.
            raise
        except Exception as exc:
            self._move(AgentStatus.ERROR, "Tool/contract error: " + type(exc).__name__)
        self._emit("run_paused_or_finished", result=self._result)
        return self.result

    def _run(self, task: Task) -> None:
        assert self._result is not None
        problem = task_problem(task, self._now())
        if problem:
            self._move(AgentStatus.BLOCKED, problem)
            return
        if not self._read_snapshot(task):
            return
        feedback: list[ConstraintCheck] = []
        while self._result.plan_attempts < self.policy.max_plan_attempts:
            assert self._snapshot is not None
            if self._refresh_expired(task):
                if self._result.status is AgentStatus.BLOCKED:
                    return
                continue
            self._result.plan_attempts += 1
            version = f"v{self._result.plan_attempts}"
            self._move(AgentStatus.PLANNING, "Plan using snapshot and latest validator feedback")
            proposal = self._call(
                "plan_route",
                PlanningRequest(
                    task=task,
                    snapshot=self._snapshot,
                    plan_version=version,
                    attempt=self._result.plan_attempts,
                    feedback=feedback,
                ),
                PlanningResult,
            )
            assert proposal is not None
            if proposal.route is None:
                self._move(AgentStatus.BLOCKED, proposal.reason or "Planner returned no route")
                return
            route = proposal.route
            problem = route_problem(route, task, self._snapshot, self._now())
            if route.plan_version != version:
                problem = "Planner did not return the requested plan_version"
            if problem:
                feedback = [ConstraintCheck(name="route_contract", passed=False, detail=problem)]
                self._emit("candidate_rejected", feedback=feedback, plan_version=version)
                continue
            if self._refresh_expired(task):
                if self._result.status is AgentStatus.BLOCKED:
                    return
                continue
            self._move(AgentStatus.VERIFYING, "Ask the independent validation tool")
            verification_started = self._now()
            report = self._call(
                "verify_route",
                VerificationRequest(task=task, route=route, snapshot=self._snapshot),
                ValidationReport,
            )
            assert report is not None
            feedback = report_failures(
                report, task, route, self._snapshot, self._now(), not_before=verification_started
            )
            if feedback:
                self._emit("candidate_rejected", feedback=feedback, plan_version=version)
                continue
            if self._refresh_expired(task):
                if self._result.status is AgentStatus.BLOCKED:
                    return
                continue
            now = self._now()
            problem = task_problem(task, now) or route_problem(route, task, self._snapshot, now)
            if problem:
                feedback = [ConstraintCheck(name="dispatch_freshness", passed=False, detail=problem)]
                self._emit("candidate_rejected", feedback=feedback, plan_version=version)
                continue
            deadlines = [now + timedelta(seconds=self.policy.command_ttl_s)]
            deadlines.extend(utc(t) for t in (route.valid_until, self._snapshot.valid_until) if t is not None)
            command = PlanCommand(
                command_id=f"{task.task_id}:{self._result.run_id}:{version}",
                task_id=task.task_id,
                plan_version=version,
                issued_at=now,
                expires_at=min(deadlines),
                payload={
                    "route": route.model_dump(mode="json"),
                    "snapshot_id": route.snapshot_id,
                    "validation": report.model_dump(mode="json"),
                    "run_mode": self._result.run_mode,
                    "is_simulated": self._result.is_simulated,
                },
            )
            self._result.route, self._result.command = route, command
            # Durable intent exists before the first potentially side-effecting tool.
            self._emit("command_prepared", command=command)
            self._move(AgentStatus.WAITING_ACK, "Command prepared; transport outcome requires a matching ACK")
            try:
                ack = self._call("submit_command", command, PlanAck, nullable=True)
            except CommandNotSubmitted:
                self._move(AgentStatus.BLOCKED, "Command expired before submission; no transport call made")
                return
            except AuditError:
                raise
            except Exception as exc:
                self._move(
                    AgentStatus.WAITING_ACK,
                    "Delivery unknown after "
                    + type(exc).__name__
                    + "; reconcile, do not automatically resubmit",
                )
                return
            if ack is not None:
                self.accept_ack(ack)
            return
        self._move(AgentStatus.BLOCKED, "Planning/validation attempt limit reached")

    def accept_ack(self, ack: PlanAck) -> AgentResult:
        with self._mutex:
            if self._closed:
                raise RuntimeError("Agent is closed")
            return self._accept_ack(ack)

    def _accept_ack(self, ack: PlanAck) -> AgentResult:
        if self._result is None or self._result.command is None or not self._submission_attempted:
            raise RuntimeError("No pending command to acknowledge")
        command = self._result.command
        if self._result.ack is not None:
            if ack == self._result.ack:
                self._emit("duplicate_ack", ack=ack)
                return self.result
            self._emit("ack_ignored", reason="Conflicting ACK after a terminal acknowledgement", ack=ack)
            return self.result
        problem = None
        if (ack.command_id, ack.task_id, ack.plan_version) != (
            command.command_id,
            command.task_id,
            command.plan_version,
        ):
            problem = "ACK command/task/version mismatch"
        else:
            try:
                received = utc(ack.received_at)
                if not command.issued_at <= received < command.expires_at or received > self._now():
                    problem = "ACK timestamp is outside the command validity window"
            except ValueError as exc:
                problem = str(exc)
        if problem:
            self._emit("ack_ignored", reason=problem, ack=ack)
            return self.result
        self._emit("ack_received", ack=ack)
        self._result.ack = ack.model_copy(deep=True)
        self._move(
            AgentStatus.ACKNOWLEDGED if ack.accepted else AgentStatus.REJECTED,
            "Command accepted; flight completion is NOT established"
            if ack.accepted
            else ack.reject_reason or "Command rejected without a reason",
        )
        return self.result
