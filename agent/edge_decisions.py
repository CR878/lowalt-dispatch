"""Pure M3 cloud/edge decisions. Never sends MAVLink or changes flight modes.

Fallback is cached-route selection followed by CURRENT-STATE local validation,
not real-time replanning. An edge transport/flight-control adapter is still needed.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import Field

from agent.audit import JsonlAudit
from agent.contracts import AgentTools, Contract, ValidationReport, VerificationRequest
from agent.guards import report_failures, route_problem, snapshot_problem, utc
from core.models import PlanCommand, RiskSnapshot, RoutePlan, Task, VehicleState


class ExecutionObservation(Contract):
    """Authenticated edge envelope; VehicleState alone has no task_id."""

    task_id: str
    state: VehicleState
    received_at: datetime
    accepted_command_id: str | None = None


class CachedFallback(Contract):
    task_id: str
    based_on_plan_version: str
    priority: int = Field(default=0, ge=0)
    cached_at: datetime
    route: RoutePlan
    snapshot: RiskSnapshot
    validation: ValidationReport


class EdgeDecision(Contract):
    action: Literal["select_cached_route", "no_valid_fallback", "reconcile_required", "synced"]
    reason: str
    task_id: str
    run_mode: Literal["mock", "integration"]
    is_simulated: bool
    route: RoutePlan | None = None
    validation: ValidationReport | None = None
    rejected_candidates: list[str] = Field(default_factory=list)


def observation_problem(
    observation: ExecutionObservation, task_id: str, now: datetime, max_age_s: float
) -> str | None:
    if observation.task_id != task_id:
        return "Telemetry belongs to another task"
    try:
        sample = utc(observation.state.ts)
        received = utc(observation.received_at)
        captured = utc(observation.state.provenance.captured_at)
        if not sample <= received <= now or captured > now:
            return "Telemetry timestamp is in the future or inconsistent"
        if any((now - ts).total_seconds() > max_age_s for ts in (sample, received, captured)):
            return "Telemetry is stale"
        prov = observation.state.provenance
        if prov.valid_from is not None and utc(prov.valid_from) > now:
            return "Telemetry source is not effective yet"
        if prov.valid_until is not None and utc(prov.valid_until) <= now:
            return "Telemetry source expired"
    except ValueError as exc:
        return str(exc)
    if not observation.state.executing_plan_version:
        return "Executed plan version is unknown"
    return None


class EdgeDecisionAgent:
    def __init__(
        self,
        tools: AgentTools,
        audit_path: Path,
        *,
        max_state_age_s: float = 5,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if not math.isfinite(max_state_age_s) or max_state_age_s <= 0:
            raise ValueError("max_state_age_s must be finite and positive")
        self.tools = tools
        self.max_state_age_s = max_state_age_s
        self.clock = clock or (lambda: datetime.now(UTC))
        self.run_mode: Literal["mock", "integration"] = "mock" if tools.is_mock else "integration"
        self.run_id = uuid4().hex
        self.audit = JsonlAudit(audit_path)
        self._is_simulated: bool | None = None
        self._task_id: str | None = None

    def _emit(self, task_id: str, event: str, **payload) -> None:
        if self._task_id is not None and self._task_id != task_id:
            raise ValueError("Use a separate EdgeDecisionAgent/audit file for each task")
        self._task_id = task_id
        self.audit.append(
            ts=utc(self.clock()),
            run_id=self.run_id,
            task_id=task_id,
            run_mode=self.run_mode,
            is_simulated=self._is_simulated,
            event=event,
            **payload,
        )

    def choose_fallback(
        self,
        task: Task,
        observation: ExecutionObservation,
        candidates: list[CachedFallback],
    ) -> EdgeDecision:
        task = task.model_copy(deep=True)
        observation = observation.model_copy(deep=True)
        candidates = [c.model_copy(deep=True) for c in candidates]
        self._is_simulated = task.provenance.is_simulated or observation.state.provenance.is_simulated
        self._emit(
            task.task_id, "fallback_started", task=task, observation=observation, candidates=candidates
        )
        rejected: list[str] = []

        def finish(action: str, reason: str, candidate=None, validation=None) -> EdgeDecision:
            result = EdgeDecision(
                action=action,
                reason=reason,
                task_id=task.task_id,
                run_mode=self.run_mode,
                is_simulated=self._is_simulated,
                route=candidate.route if candidate else None,
                validation=validation,
                rejected_candidates=rejected,
            )
            self._emit(task.task_id, "fallback_decided", result=result)
            return result

        problem = observation_problem(observation, task.task_id, utc(self.clock()), self.max_state_age_s)
        if problem:
            return finish("no_valid_fallback", problem)
        energy = observation.state.energy_remaining_wh
        if energy is None or not math.isfinite(energy) or energy <= task.reserve_energy_wh:
            return finish("no_valid_fallback", "Current usable energy is unknown or does not exceed reserve")

        for candidate in sorted(candidates, key=lambda c: (c.priority, c.route.route_id)):
            now = utc(self.clock())
            problem = observation_problem(observation, task.task_id, now, self.max_state_age_s)
            if problem:
                return finish("no_valid_fallback", problem)
            if candidate.task_id != task.task_id:
                problem = "Cached route belongs to another task"
            elif candidate.based_on_plan_version != observation.state.executing_plan_version:
                problem = "Cached route is based on a different active plan version"
            elif candidate.route.plan_version == observation.state.executing_plan_version:
                problem = "Fallback must have its own distinct plan version"
            else:
                try:
                    problem = "Cache timestamp is in the future" if utc(candidate.cached_at) > now else None
                except ValueError as exc:
                    problem = str(exc)
            problem = problem or snapshot_problem(candidate.snapshot, now)
            problem = problem or route_problem(candidate.route, task, candidate.snapshot, now)
            if not problem:
                problems = report_failures(
                    candidate.validation,
                    task,
                    candidate.route,
                    candidate.snapshot,
                    candidate.cached_at,
                    not_before=candidate.validation.verified_at,
                )
                problem = "; ".join(p.detail for p in problems) or None
            if problem:
                rejected.append(f"{candidate.route.route_id}: {problem}")
                self._emit(
                    task.task_id, "cached_route_rejected", route_id=candidate.route.route_id, reason=problem
                )
                continue

            request = VerificationRequest(
                task=task, route=candidate.route, snapshot=candidate.snapshot, vehicle_state=observation.state
            )
            started = utc(self.clock())
            call_id = uuid4().hex
            self._emit(task.task_id, "tool_started", call_id=call_id, tool="verify_route", input=request)
            try:
                report = ValidationReport.model_validate(
                    self.tools.verify_route(request.model_copy(deep=True))
                )
            except Exception as exc:
                self._emit(
                    task.task_id,
                    "tool_failed",
                    call_id=call_id,
                    tool="verify_route",
                    error_type=type(exc).__name__,
                )
                rejected.append(
                    f"{candidate.route.route_id}: local validation unavailable ({type(exc).__name__})"
                )
                continue
            self._emit(task.task_id, "tool_completed", call_id=call_id, tool="verify_route", output=report)
            now = utc(self.clock())
            problems = report_failures(
                report,
                task,
                candidate.route,
                candidate.snapshot,
                now,
                not_before=started,
                vehicle_state=observation.state,
            )
            problem = observation_problem(observation, task.task_id, now, self.max_state_age_s)
            problem = problem or snapshot_problem(candidate.snapshot, now)
            problem = problem or route_problem(candidate.route, task, candidate.snapshot, now)
            if problems or problem:
                reason = problem or "; ".join(p.detail for p in problems)
                rejected.append(f"{candidate.route.route_id}: {reason}")
                self._emit(
                    task.task_id, "cached_route_rejected", route_id=candidate.route.route_id, reason=reason
                )
                continue
            return finish(
                "select_cached_route",
                "Prevalidated cache passed current-state local validation; "
                "selection only, no flight command was sent",
                candidate,
                report,
            )
        return finish(
            "no_valid_fallback", "No valid cached route; defer to existing flight-controller/operator policy"
        )

    def reconcile(
        self,
        task_id: str,
        cloud_command: PlanCommand,
        observation: ExecutionObservation,
    ) -> EdgeDecision:
        """A comparison only. No automatic overwrite, resend, or claim of delivery."""
        now = utc(self.clock())
        self._is_simulated = observation.state.provenance.is_simulated
        self._emit(task_id, "reconcile_started", command=cloud_command, observation=observation)
        problem = observation_problem(observation, task_id, now, self.max_state_age_s)
        if cloud_command.task_id != task_id:
            problem = "Cloud command belongs to another task"
        elif observation.state.executing_plan_version != cloud_command.plan_version:
            problem = problem or "Cloud/edge plan versions differ; record edge state before new dispatch"
        elif observation.accepted_command_id != cloud_command.command_id:
            problem = problem or "Accepted command identifier differs or is unknown"
        result = EdgeDecision(
            action="reconcile_required" if problem else "synced",
            task_id=task_id,
            run_mode=self.run_mode,
            is_simulated=self._is_simulated,
            reason=problem or "Task, accepted command and executed version agree; no command sent",
        )
        self._emit(task_id, "reconcile_decided", result=result)
        return result
