"""M3 decision behavior and failure paths; fixtures are explicitly nonphysical."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from agent.audit import AuditError
from agent.contracts import AgentStatus, route_digest
from agent.demo import main as demo_main
from agent.edge_decisions import EdgeDecisionAgent
from agent.engine import TaskAgent
from agent.fixtures import FixtureTools, fixture_task
from agent.link import CloudLinkMonitor, LinkPolicy, LinkSample
from agent.replay import summarize
from core.models import AltitudeReference, PlanAck, PlanCommand


class Clock:
    def __init__(self):
        self.now = datetime(2026, 11, 9, 8, tzinfo=UTC)

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock():
    return Clock()


def run_agent(tmp_path, clock, scenario="normal", *, tools=None, policy=None):
    tools = tools or FixtureTools(scenario, clock=clock)
    agent = TaskAgent(tools, tmp_path / "trace_MOCK.jsonl", clock=clock, policy=policy)
    return agent, tools, agent.run(fixture_task(clock()))


def test_normal_binds_command_and_requires_real_ack_semantics(tmp_path, clock):
    _, tools, result = run_agent(tmp_path, clock)
    assert result.status is AgentStatus.ACKNOWLEDGED
    assert result.run_mode == "mock" and result.is_simulated
    assert len(tools.submitted) == 1
    command = tools.submitted[0]
    assert result.ack.command_id == command.command_id
    assert command.payload["validation"]["route_digest"] == route_digest(result.route)
    assert "completion is NOT established" in result.reason
    assert not hasattr(result, "delivered")
    records = [json.loads(s) for s in Path(result.audit_path).read_text(encoding="utf-8").splitlines()]
    prepared = next(i for i, row in enumerate(records) if row["event"] == "command_prepared")
    submitted = next(
        i
        for i, row in enumerate(records)
        if row["event"] == "tool_started" and row["tool"] == "submit_command"
    )
    assert prepared < submitted
    assert {r["run_mode"] for r in records} == {"mock"}
    assert summarize(Path(result.audit_path))["incomplete_tool_calls"] == {}


def test_rejection_feedback_changes_next_plan_and_version(tmp_path, clock):
    _, tools, result = run_agent(tmp_path, clock, "replan")
    assert result.status is AgentStatus.ACKNOWLEDGED
    assert result.plan_attempts == 2
    assert [r.plan_version for r in tools.requests] == ["v1", "v2"]
    assert not tools.requests[0].feedback
    assert tools.requests[1].feedback[0].name == "diversion_reachability"
    assert not tools.requests[1].feedback[0].passed
    assert len(tools.submitted) == 1 and tools.submitted[0].plan_version == "v2"


def test_stale_snapshot_refetched_before_planning(tmp_path, clock):
    _, tools, result = run_agent(tmp_path, clock, "stale")
    assert result.snapshot_refreshes == 1 and tools.snapshots_read == 2
    assert len(tools.requests) == 1 and tools.requests[0].snapshot.snapshot_id == "MOCK-S2"


def test_forever_expired_snapshot_has_bounded_retry(tmp_path, clock):
    class Expired(FixtureTools):
        def get_snapshot(self, task):
            snapshot = super().get_snapshot(task)
            return snapshot.model_copy(update={"valid_until": clock()})

    _, tools, result = run_agent(tmp_path, clock, tools=Expired(clock=clock))
    assert result.status is AgentStatus.BLOCKED
    assert tools.snapshots_read == 2 and not tools.requests and not tools.submitted


def test_expiry_during_validation_replans_against_new_snapshot(tmp_path, clock):
    class SlowFirst(FixtureTools):
        def verify_route(self, request):
            if not self.verifications:
                clock.advance(121)
            return super().verify_route(request)

    _, tools, result = run_agent(tmp_path, clock, tools=SlowFirst(clock=clock))
    assert result.status is AgentStatus.ACKNOWLEDGED
    assert tools.snapshots_read == 2 and result.plan_attempts == 2
    assert tools.submitted[0].payload["snapshot_id"] == "MOCK-S2"


@pytest.mark.parametrize("scenario,attempts", [("no_route", 1), ("missing_check", 3)])
def test_no_feasible_or_complete_verification_never_submits(tmp_path, clock, scenario, attempts):
    _, tools, result = run_agent(tmp_path, clock, scenario)
    assert result.status is AgentStatus.BLOCKED
    assert result.plan_attempts == attempts and not tools.submitted


@pytest.mark.parametrize("mutation", ["snapshot", "version", "coordinates", "expired"])
def test_bad_plan_contract_never_reaches_validator(tmp_path, clock, mutation):
    class BadPlan(FixtureTools):
        def plan_route(self, request):
            output = super().plan_route(request)
            updates = {
                "snapshot": {"snapshot_id": "WRONG"},
                "version": {"plan_version": "v999"},
                "expired": {"valid_until": clock()},
            }
            if mutation == "coordinates":
                point = request.task.origin.model_copy(update={"alt_ref": AltitudeReference.AMSL})
                update = {"waypoints": [point, point]}
            else:
                update = updates[mutation]
            return output.model_copy(update={"route": output.route.model_copy(update=update)})

    _, tools, result = run_agent(tmp_path, clock, tools=BadPlan(clock=clock))
    assert result.status is AgentStatus.BLOCKED
    assert not tools.verifications and not tools.submitted


@pytest.mark.parametrize(
    "mutation", ["task_id", "route_digest", "snapshot_id", "old", "future", "duplicates", "empty"]
)
def test_invalid_independent_report_never_submits(tmp_path, clock, mutation):
    class BadReport(FixtureTools):
        def verify_route(self, request):
            report = super().verify_route(request)
            if mutation in ("task_id", "route_digest", "snapshot_id"):
                return report.model_copy(update={mutation: "WRONG"})
            if mutation in ("old", "future"):
                return report.model_copy(
                    update={"verified_at": clock() + timedelta(seconds=-1 if mutation == "old" else 1)}
                )
            return report.model_copy(
                update={"checks": [] if mutation == "empty" else report.checks + [report.checks[0]]}
            )

    _, tools, result = run_agent(tmp_path, clock, tools=BadReport(clock=clock))
    assert result.status is AgentStatus.BLOCKED and not tools.submitted
    assert len(tools.verifications) == 3


def test_timeout_never_causes_automatic_resend_and_late_ack_can_resolve(tmp_path, clock):
    agent, tools, result = run_agent(tmp_path, clock, "ack_timeout")
    assert result.status is AgentStatus.WAITING_ACK and len(tools.submitted) == 1
    command = result.command
    clock.advance(1)
    ack = PlanAck(
        command_id=command.command_id,
        task_id=command.task_id,
        plan_version=command.plan_version,
        received_at=clock(),
        accepted=True,
    )
    result = agent.accept_ack(ack)
    assert result.status is AgentStatus.ACKNOWLEDGED
    assert agent.accept_ack(ack) == result  # duplicate ACK has no execution side effect
    assert len(tools.submitted) == 1
    with pytest.raises(RuntimeError, match="One TaskAgent"):
        agent.run(fixture_task(clock()))


@pytest.mark.parametrize("mutation", ["task_id", "plan_version", "command_id", "expired", "naive", "future"])
def test_unrelated_or_invalid_ack_does_not_establish_acceptance(tmp_path, clock, mutation):
    agent, tools, result = run_agent(tmp_path, clock, "ack_timeout")
    command = result.command
    ack = PlanAck(
        command_id=command.command_id,
        task_id=command.task_id,
        plan_version=command.plan_version,
        received_at=clock(),
        accepted=True,
    )
    if mutation in ("task_id", "plan_version", "command_id"):
        ack = ack.model_copy(update={mutation: "OTHER"})
    elif mutation == "expired":
        clock.advance(31)
        ack = ack.model_copy(update={"received_at": clock()})
    else:
        ack = ack.model_copy(
            update={
                "received_at": clock().replace(tzinfo=None)
                if mutation == "naive"
                else clock() + timedelta(seconds=1)
            }
        )
    assert agent.accept_ack(ack).status is AgentStatus.WAITING_ACK
    assert len(tools.submitted) == 1


def test_negative_ack_is_explicitly_rejected(tmp_path, clock):
    agent, _, result = run_agent(tmp_path, clock, "ack_timeout")
    ack = PlanAck(
        command_id=result.command.command_id,
        task_id=result.task_id,
        plan_version=result.command.plan_version,
        received_at=clock(),
        accepted=False,
        reject_reason="fixture edge rejected command",
    )
    assert agent.accept_ack(ack).status is AgentStatus.REJECTED
    assert agent.result.reason == "fixture edge rejected command"


def test_command_expiry_is_capped_by_route_and_snapshot(tmp_path, clock):
    class ShortRoute(FixtureTools):
        def plan_route(self, request):
            result = super().plan_route(request)
            return result.model_copy(
                update={
                    "route": result.route.model_copy(update={"valid_until": clock() + timedelta(seconds=2)})
                }
            )

    _, tools, _ = run_agent(tmp_path, clock, tools=ShortRoute(clock=clock))
    assert tools.submitted[0].expires_at == clock() + timedelta(seconds=2)


def test_audit_failure_before_submit_blocks_side_effect(tmp_path, clock, monkeypatch):
    from agent.audit import JsonlAudit

    original = JsonlAudit.append

    def fail_intent(self, **record):
        if record["event"] == "command_prepared":
            raise AuditError("fixture disk full")
        return original(self, **record)

    monkeypatch.setattr(JsonlAudit, "append", fail_intent)
    tools = FixtureTools(clock=clock)
    with pytest.raises(AuditError):
        run_agent(tmp_path, clock, tools=tools)
    assert not tools.submitted


def test_tool_failure_is_audited_without_claiming_success(tmp_path, clock):
    class Broken(FixtureTools):
        def plan_route(self, request):
            raise ConnectionError("fixture unavailable")

    _, tools, result = run_agent(tmp_path, clock, tools=Broken(clock=clock))
    assert result.status is AgentStatus.ERROR and not tools.submitted
    replay = summarize(Path(result.audit_path))
    assert not replay["incomplete_tool_calls"]


def test_timezone_free_task_is_blocked(tmp_path, clock):
    tools = FixtureTools(clock=clock)
    task = fixture_task(clock())
    task.provenance.captured_at = clock().replace(tzinfo=None)
    agent = TaskAgent(tools, tmp_path / "naive.jsonl", clock=clock)
    assert agent.run(task).status is AgentStatus.BLOCKED
    assert not tools.requests


def test_audit_path_cannot_overwrite_previous_run(tmp_path, clock):
    run_agent(tmp_path, clock)
    with pytest.raises(FileExistsError):
        run_agent(tmp_path, clock)


def test_fallback_requires_prevalidation_and_current_state_validation(tmp_path, clock):
    tools = FixtureTools(clock=clock)
    task, observation, cached = tools.fallback_fixture()
    edge = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock)
    result = edge.choose_fallback(task, observation, [cached])
    assert result.action == "select_cached_route" and result.route.plan_version == "v2"
    assert tools.verifications[-1].vehicle_state.ts == observation.state.ts
    assert len(tools.requests) == 1  # fixture setup only; fallback does not call planner
    assert not tools.submitted


@pytest.mark.parametrize(
    "mutation", ["stale", "wrong_task", "wrong_base", "expired", "tampered", "missing_energy", "old_state"]
)
def test_invalid_fallback_never_selects_route(tmp_path, clock, mutation):
    tools = FixtureTools(clock=clock)
    task, observation, cached = tools.fallback_fixture()
    if mutation == "stale":
        cached.snapshot.valid_until = clock()
    elif mutation == "wrong_task":
        cached.task_id = "OTHER"
    elif mutation == "wrong_base":
        cached.based_on_plan_version = "v999"
    elif mutation == "expired":
        cached.route.valid_until = clock()
    elif mutation == "tampered":
        cached.route.energy_budget_wh += 1  # same route_id is insufficient; digest must change
    elif mutation == "missing_energy":
        observation.state.energy_remaining_wh = None
    else:
        clock.advance(6)
    result = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock).choose_fallback(
        task, observation, [cached]
    )
    assert result.action == "no_valid_fallback" and result.route is None
    assert not tools.submitted


def test_fallback_rejects_validation_not_bound_to_current_state(tmp_path, clock):
    class Unbound(FixtureTools):
        def verify_route(self, request):
            return super().verify_route(request).model_copy(update={"vehicle_state_ts": None})

    tools = Unbound(clock=clock)
    task, observation, cached = tools.fallback_fixture()
    result = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock).choose_fallback(
        task, observation, [cached]
    )
    assert result.action == "no_valid_fallback"
    assert "telemetry timestamp" in result.rejected_candidates[0]


@pytest.mark.parametrize(
    "mutation,expected",
    [
        ("none", "synced"),
        ("version", "reconcile_required"),
        ("command", "reconcile_required"),
        ("task", "reconcile_required"),
        ("stale", "reconcile_required"),
    ],
)
def test_reconciliation_never_resends_or_overwrites(tmp_path, clock, mutation, expected):
    tools = FixtureTools(clock=clock)
    task, observation, _ = tools.fallback_fixture()
    command = PlanCommand(
        command_id=observation.accepted_command_id,
        task_id=task.task_id,
        plan_version="v1",
        issued_at=clock(),
        expires_at=clock() + timedelta(seconds=30),
    )
    if mutation == "version":
        command.plan_version = "v2"
    elif mutation == "command":
        command.command_id = "OTHER"
    elif mutation == "task":
        observation.task_id = "OTHER"
    elif mutation == "stale":
        clock.advance(6)
    result = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock).reconcile(
        task.task_id, command, observation
    )
    assert result.action == expected and not tools.submitted


def test_replay_detects_missing_records_and_leaves_inflight_tools_visible(tmp_path, clock):
    _, _, result = run_agent(tmp_path, clock)
    source = Path(result.audit_path)
    rows = source.read_text(encoding="utf-8").splitlines()
    bad = tmp_path / "corrupt.jsonl"
    bad.write_text("\n".join(rows[:2] + rows[3:]), encoding="utf-8")
    with pytest.raises(ValueError, match="sequence"):
        summarize(bad)
    started = next(i for i, row in enumerate(rows) if json.loads(row)["event"] == "tool_started")
    bad.write_text("\n".join(rows[: started + 1]), encoding="utf-8")
    assert summarize(bad)["incomplete_tool_calls"]


def test_all_demo_scenarios_are_explicitly_mock(tmp_path):
    assert demo_main(["--scenario", "all", "--out-dir", str(tmp_path / "demo")]) == 0
    summary = json.loads(next(tmp_path.rglob("summary_MOCK.json")).read_text(encoding="utf-8"))
    assert len(summary["scenarios"]) == 9
    assert summary["run_mode"] == "mock"
    assert {r["run_mode"] for r in summary["scenarios"]} == {"mock"}


def test_cloud_heartbeat_timeout_recovery_requires_reconciliation(clock):
    monitor = CloudLinkMonitor(clock=clock)
    assert monitor.poll().status == "unknown"
    assert monitor.observe(LinkSample(received_at=clock(), round_trip_ms=20)).status == "degraded"
    clock.advance(1)
    assert monitor.observe(LinkSample(received_at=clock(), round_trip_ms=20)).status == "healthy"
    clock.advance(5)
    down = monitor.poll()
    assert down.status == "disconnected" and down.consider_cached_fallback
    clock.advance(1)
    assert monitor.observe(LinkSample(received_at=clock(), round_trip_ms=20)).status == "degraded"
    # Replaying the same heartbeat is not a second healthy observation.
    assert monitor.observe(LinkSample(received_at=clock(), round_trip_ms=20)).status == "degraded"
    clock.advance(1)
    up = monitor.observe(LinkSample(received_at=clock(), round_trip_ms=20))
    assert up.status == "healthy" and up.requires_reconciliation
    assert not monitor.mark_reconciled().requires_reconciliation


@pytest.mark.parametrize("sample", [{"round_trip_ms": 300}, {"loss_pct": 10}, {}])
def test_poor_or_unknown_link_quality_does_not_claim_healthy(clock, sample):
    monitor = CloudLinkMonitor(policy=LinkPolicy(healthy_samples_to_recover=1), clock=clock)
    assert monitor.observe(LinkSample(received_at=clock(), **sample)).status == "degraded"


def test_expiry_between_intent_log_and_transport_is_known_not_submitted(tmp_path, clock, monkeypatch):
    from agent.audit import JsonlAudit

    original = JsonlAudit.append

    def slow_intent(self, **record):
        original(self, **record)
        if record["event"] == "command_prepared":
            clock.advance(31)

    monkeypatch.setattr(JsonlAudit, "append", slow_intent)
    agent, tools, result = run_agent(tmp_path, clock)
    assert result.status is AgentStatus.BLOCKED and not tools.submitted
    assert "before submission" in result.reason
    with pytest.raises(RuntimeError, match="No pending command"):
        agent.accept_ack(
            PlanAck(
                command_id=result.command.command_id,
                task_id=result.task_id,
                plan_version=result.command.plan_version,
                received_at=clock(),
                accepted=True,
            )
        )


def test_fallback_falls_through_bad_priority_candidate_without_replanning(tmp_path, clock):
    tools = FixtureTools(clock=clock)
    task, observation, cached = tools.fallback_fixture()
    invalid = cached.model_copy(deep=True)
    invalid.route.route_id = "MOCK-FIRST-BUT-INVALID"
    cached.priority = 1
    result = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock).choose_fallback(
        task, observation, [cached, invalid]
    )
    assert result.action == "select_cached_route"
    assert len(result.rejected_candidates) == 1
    assert result.route.route_id == cached.route.route_id
    assert len(tools.requests) == 1 and not tools.submitted


def test_telemetry_expiry_during_local_validation_prevents_fallback(tmp_path, clock):
    class Slow(FixtureTools):
        def verify_route(self, request):
            if request.vehicle_state is not None:
                clock.advance(6)
            return super().verify_route(request)

    tools = Slow(clock=clock)
    task, observation, cached = tools.fallback_fixture()
    result = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock).choose_fallback(
        task, observation, [cached]
    )
    assert result.action == "no_valid_fallback" and not tools.submitted


def test_edge_audit_file_cannot_mix_unrelated_tasks(tmp_path, clock):
    tools = FixtureTools(clock=clock)
    task, observation, cached = tools.fallback_fixture()
    edge = EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock)
    edge.choose_fallback(task, observation, [cached])
    task.task_id = "OTHER-TASK"
    with pytest.raises(ValueError, match="separate EdgeDecisionAgent"):
        edge.choose_fallback(task, observation, [])
