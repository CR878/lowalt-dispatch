"""Recover decision/ACK state from evidence without replaying any tool call."""

from __future__ import annotations

from pathlib import Path

from agent.contracts import AgentPolicy, AgentResult, AgentStatus
from agent.guards import utc
from agent.replay import summarize_records
from core.models import PlanAck, PlanCommand, RoutePlan, Task


def recover_result(records: list[dict], path: Path) -> tuple[AgentResult, AgentPolicy, bool, dict[str, str]]:
    summary = summarize_records(records)
    starts = [r for r in records if r["event"] == "run_started"]
    if len(starts) != 1:
        raise ValueError("Recovery requires exactly one task-agent run_started record")
    start = starts[0]
    task = Task.model_validate(start["task"])
    if task.task_id != summary["task_id"]:
        raise ValueError("Recorded task identity differs from the audit envelope")
    policy = AgentPolicy.model_validate(start["policy"])
    result = AgentResult(
        run_id=summary["run_id"],
        task_id=task.task_id,
        run_mode=summary["run_mode"],
        is_simulated=task.provenance.is_simulated,
        audit_path=str(path),
    )
    known_not_submitted = False
    snapshot_calls = 0
    for row in records:
        if row.get("is_simulated") is not task.provenance.is_simulated:
            raise ValueError("Simulation provenance changed within one task run")
        event = row["event"]
        if event == "state_changed":
            result.status = AgentStatus(row["status"])
            result.reason = row["reason"]
        elif event == "tool_started" and row["tool"] == "get_snapshot":
            snapshot_calls += 1
        elif event == "tool_started" and row["tool"] == "plan_route":
            result.plan_attempts = max(result.plan_attempts, int(row["input"]["attempt"]))
        elif event == "tool_started" and row["tool"] == "submit_command":
            if result.command is None or PlanCommand.model_validate(row["input"]) != result.command:
                raise ValueError("Submission differs from the durable command intent")
        elif event == "command_prepared":
            if result.command is not None:
                raise ValueError("Multiple command intents in one task run")
            command = PlanCommand.model_validate(row["command"])
            route = RoutePlan.model_validate(command.payload["route"])
            if command.task_id != task.task_id or command.plan_version != route.plan_version:
                raise ValueError("Command task/version differs from its recorded route")
            if utc(command.issued_at) >= utc(command.expires_at):
                raise ValueError("Invalid recorded command validity window")
            result.command, result.route = command, route
        elif event == "tool_failed" and row["tool"] == "submit_command":
            known_not_submitted = row["error_type"] == "CommandNotSubmitted"
        elif event == "ack_received":
            ack = PlanAck.model_validate(row["ack"])
            command = result.command
            if command is None or (ack.command_id, ack.task_id, ack.plan_version) != (
                command.command_id,
                command.task_id,
                command.plan_version,
            ):
                raise ValueError("Recorded ACK does not match the command intent")
            if not utc(command.issued_at) <= utc(ack.received_at) < utc(command.expires_at):
                raise ValueError("Recorded ACK lies outside the command validity window")
            if result.ack is not None and result.ack != ack:
                raise ValueError("Conflicting recorded ACKs")
            result.ack = ack
    result.snapshot_refreshes = max(0, snapshot_calls - 1)
    if result.ack is not None:
        if known_not_submitted:
            raise ValueError("An unsubmitted command cannot have a recorded ACK")
        result.status = AgentStatus.ACKNOWLEDGED if result.ack.accepted else AgentStatus.REJECTED
        result.reason = (
            "Recovered accepted command; flight completion is NOT established"
            if result.ack.accepted
            else result.ack.reject_reason or "Recovered command rejection"
        )
    elif result.command is not None and not known_not_submitted:
        result.status = AgentStatus.WAITING_ACK
        result.reason = "Recovered command intent; delivery is unknown, reconcile without resubmitting"
    elif result.status not in (AgentStatus.BLOCKED, AgentStatus.ERROR):
        result.status = AgentStatus.BLOCKED
        result.reason = "Interrupted before submission; no automatic continuation or tool replay"
    return (
        result,
        policy,
        result.command is not None and not known_not_submitted,
        summary["incomplete_tool_calls"],
    )
