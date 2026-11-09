"""Process restart, persisted cache, concurrent writers and integration guards."""

from __future__ import annotations

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from agent.cache import FallbackCache
from agent.contracts import AgentStatus
from agent.edge_decisions import EdgeDecision, EdgeDecisionAgent
from agent.engine import TaskAgent
from agent.fixtures import FixtureTools, fixture_task
from agent.link import CloudLinkMonitor, LinkPolicy, LinkSample
from agent.replay import summarize
from agent.storage import FileLease, ResourceBusyError
from core.models import ConstraintCheck, PlanAck


class Clock:
    def __init__(self):
        self.now = datetime(2026, 11, 9, 9, tzinfo=UTC)

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock():
    return Clock()


def stopped_run(tmp_path, clock, scenario="ack_timeout"):
    path = tmp_path / "trace_MOCK.jsonl"
    tools = FixtureTools(scenario, clock=clock)
    agent = TaskAgent(tools, path, clock=clock)
    result = agent.run(fixture_task(clock()))
    agent.close()
    return path, result


def valid_ack(command, clock):
    return PlanAck(
        command_id=command.command_id,
        task_id=command.task_id,
        plan_version=command.plan_version,
        received_at=clock(),
        accepted=True,
    )


def cut_after_event(path, destination, event, *, tool=None):
    lines = path.read_bytes().splitlines(keepends=True)
    for index, line in enumerate(lines):
        row = json.loads(line)
        if row["event"] == event and (tool is None or row.get("tool") == tool):
            destination.write_bytes(b"".join(lines[: index + 1]))
            return destination
    raise AssertionError("Fixture event missing")


def test_restore_pending_command_accepts_ack_without_any_tool_replay(tmp_path, clock):
    path, original = stopped_run(tmp_path, clock)
    tools = FixtureTools(clock=clock)
    with TaskAgent.restore(tools, path, clock=clock) as restored:
        assert restored.result.command == original.command
        assert restored.result.status is AgentStatus.WAITING_ACK
        clock.advance(1)
        assert restored.accept_ack(valid_ack(original.command, clock)).status is AgentStatus.ACKNOWLEDGED
        with pytest.raises(RuntimeError, match="One TaskAgent"):
            restored.run(fixture_task(clock()))
    assert not tools.requests and not tools.verifications and not tools.submitted
    assert not summarize(path)["incomplete_tool_calls"]
    # A second restart retains the ACK, not just the earlier run result.
    with TaskAgent.restore(tools, path, clock=clock) as again:
        assert again.result.status is AgentStatus.ACKNOWLEDGED


@pytest.mark.parametrize("event,tool", [("command_prepared", None), ("tool_started", "submit_command")])
def test_crash_around_submission_intent_is_unknown_and_never_resubmitted(tmp_path, clock, event, tool):
    original, _ = stopped_run(tmp_path, clock, "normal")
    truncated = cut_after_event(original, tmp_path / "crash.jsonl", event, tool=tool)
    tools = FixtureTools(clock=clock)
    with TaskAgent.restore(tools, truncated, clock=clock) as restored:
        assert restored.result.status is AgentStatus.WAITING_ACK
        assert restored.result.command is not None
    assert not tools.submitted and not tools.requests
    assert not summarize(truncated)["incomplete_tool_calls"]


def test_crash_after_durable_ack_before_state_transition_retains_acceptance(tmp_path, clock):
    original, _ = stopped_run(tmp_path, clock, "normal")
    truncated = cut_after_event(original, tmp_path / "crash.jsonl", "ack_received")
    with TaskAgent.restore(FixtureTools(clock=clock), truncated, clock=clock) as restored:
        assert restored.result.status is AgentStatus.ACKNOWLEDGED
        assert "completion is NOT established" in restored.result.reason


def test_pre_submission_crash_is_blocked_not_reexecuted(tmp_path, clock):
    original, _ = stopped_run(tmp_path, clock)
    truncated = cut_after_event(original, tmp_path / "crash.jsonl", "tool_started", tool="plan_route")
    tools = FixtureTools(clock=clock)
    with TaskAgent.restore(tools, truncated, clock=clock) as restored:
        assert restored.result.status is AgentStatus.BLOCKED and restored.result.command is None
    assert not tools.requests and not tools.submitted
    assert not summarize(truncated)["incomplete_tool_calls"]


def test_torn_tail_is_refused_by_default_and_preserved_when_explicitly_repaired(tmp_path, clock):
    path, _ = stopped_run(tmp_path, clock)
    fragment = b'{"sequence":999,"event":"tool_'
    with path.open("ab") as stream:
        stream.write(fragment)
    before = path.read_bytes()
    with pytest.raises(ValueError, match="Invalid audit JSON"):
        TaskAgent.restore(FixtureTools(clock=clock), path, clock=clock)
    assert path.read_bytes() == before
    with TaskAgent.restore(FixtureTools(clock=clock), path, clock=clock, repair_tail=True) as restored:
        assert restored.result.status is AgentStatus.WAITING_ACK
    backup = next(tmp_path.glob("trace_MOCK.jsonl.partial-*"))
    assert backup.read_bytes() == fragment
    assert not summarize(path)["incomplete_tool_calls"]


def test_corrupt_interior_record_cannot_be_silently_repaired(tmp_path, clock):
    path, _ = stopped_run(tmp_path, clock)
    lines = path.read_bytes().splitlines(keepends=True)
    lines[1] = b"invalid interior record\n"
    path.write_bytes(b"".join(lines))
    before = path.read_bytes()
    with pytest.raises(ValueError, match="Invalid audit JSON"):
        TaskAgent.restore(FixtureTools(clock=clock), path, clock=clock, repair_tail=True)
    assert path.read_bytes() == before


def test_restore_refuses_mode_change_without_altering_journal(tmp_path, clock):
    path, _ = stopped_run(tmp_path, clock)
    before = path.read_bytes()
    tools = FixtureTools(clock=clock)
    tools.is_mock = False
    with pytest.raises(ValueError, match="MOCK"):
        TaskAgent.restore(tools, path, clock=clock)
    assert path.read_bytes() == before


def test_restore_rejects_a_clock_behind_recorded_events(tmp_path, clock):
    path, _ = stopped_run(tmp_path, clock)
    clock.advance(-1)
    with pytest.raises(ValueError, match="clock is behind"):
        TaskAgent.restore(FixtureTools(clock=clock), path, clock=clock)


def test_live_writer_prevents_a_second_recovery_writer(tmp_path, clock):
    tools = FixtureTools("ack_timeout", clock=clock)
    path = tmp_path / "trace.jsonl"
    with TaskAgent(tools, path, clock=clock) as original:
        original.run(fixture_task(clock()))
        with pytest.raises(ResourceBusyError):
            TaskAgent.restore(tools, path, clock=clock)
    with TaskAgent.restore(tools, path, clock=clock) as restored:
        assert restored.result.status is AgentStatus.WAITING_ACK


def test_cross_process_lease_releases_after_owner_closes(tmp_path):
    path = tmp_path / "lease.lock"
    script = (
        "import sys\nfrom pathlib import Path\n"
        "from agent.storage import FileLease, ResourceBusyError\n"
        "try:\n lease=FileLease(Path(sys.argv[1]))\n print('acquired')\n lease.close()\n"
        "except ResourceBusyError:\n print('busy')\n"
    )
    with FileLease(path):
        result = subprocess.run(
            [sys.executable, "-c", script, str(path)], capture_output=True, text=True, timeout=10
        )
        assert result.returncode == 0 and result.stdout.strip() == "busy", result.stderr
    result = subprocess.run(
        [sys.executable, "-c", script, str(path)], capture_output=True, text=True, timeout=10
    )
    assert result.returncode == 0 and result.stdout.strip() == "acquired", result.stderr


def test_concurrent_duplicate_acks_have_one_acceptance_and_valid_evidence(tmp_path, clock):
    tools = FixtureTools("ack_timeout", clock=clock)
    path = tmp_path / "concurrent.jsonl"
    with TaskAgent(tools, path, clock=clock) as agent:
        result = agent.run(fixture_task(clock()))
        ack = valid_ack(result.command, clock)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(agent.accept_ack, [ack] * 8))
        assert all(r.status is AgentStatus.ACKNOWLEDGED for r in results)
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert sum(r["event"] == "ack_received" for r in rows) == 1
    assert sum(r["event"] == "duplicate_ack" for r in rows) == 7
    assert not summarize(path)["incomplete_tool_calls"] and len(tools.submitted) == 1


def cache_fixture(tmp_path, clock):
    tools = FixtureTools(clock=clock)
    task, observation, candidate = tools.fallback_fixture()
    return tools, task, observation, candidate, FallbackCache(tmp_path / "fallback_MOCK.json", clock=clock)


def test_cache_round_trip_does_not_authorize_or_call_tools(tmp_path, clock):
    tools, task, observation, candidate, cache = cache_fixture(tmp_path, clock)
    written = cache.save(task, [candidate], run_mode="mock", expected_revision=0)
    loaded = cache.load(task_id=task.task_id, run_mode="mock")
    assert written == loaded and loaded.revision == 1
    assert not tools.submitted and len(tools.verifications) == 1  # only fixture setup
    with EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock) as edge:
        result = edge.choose_fallback(task, observation, loaded.candidates)
        assert result.action == "select_cached_route"
    assert len(tools.verifications) == 2 and not tools.submitted


@pytest.mark.parametrize("mutation", ["task", "mode", "checksum"])
def test_cache_load_rejects_mixed_modes_wrong_tasks_or_edits(tmp_path, clock, mutation):
    _, task, _, candidate, cache = cache_fixture(tmp_path, clock)
    cache.save(task, [candidate], run_mode="mock")
    if mutation == "checksum":
        envelope = json.loads(cache.path.read_text(encoding="utf-8"))
        envelope["bundle"]["candidates"][0]["route"]["energy_budget_wh"] += 1
        cache.path.write_text(json.dumps(envelope), encoding="utf-8")
    with pytest.raises(ValueError):
        cache.load(
            task_id="OTHER" if mutation == "task" else task.task_id,
            run_mode="integration" if mutation == "mode" else "mock",
        )


def test_cache_revision_prevents_stale_replacement(tmp_path, clock):
    _, task, _, candidate, cache = cache_fixture(tmp_path, clock)
    cache.save(task, [candidate], run_mode="mock", expected_revision=0)
    with pytest.raises(ValueError, match="revision changed"):
        cache.save(task, [], run_mode="mock", expected_revision=0)
    assert cache.load(task_id=task.task_id, run_mode="mock").candidates
    assert cache.save(task, [], run_mode="mock", expected_revision=1).revision == 2


def test_failed_atomic_replace_preserves_prior_cache_and_cleans_temporary_file(tmp_path, clock, monkeypatch):
    _, task, _, candidate, cache = cache_fixture(tmp_path, clock)
    cache.save(task, [candidate], run_mode="mock")
    before = cache.path.read_bytes()

    def fail_replace(*_):
        raise OSError("fixture replace failure")

    monkeypatch.setattr("agent.storage.os.replace", fail_replace)
    with pytest.raises(OSError):
        cache.save(task, [], run_mode="mock")
    assert cache.path.read_bytes() == before
    assert not list(tmp_path.glob("*.tmp"))


@pytest.mark.parametrize("mutation", ["duplicate", "tampered", "wrong_task", "wrong_mode", "future"])
def test_cache_cannot_store_unapproved_or_ambiguous_candidates(tmp_path, clock, mutation):
    _, task, _, candidate, cache = cache_fixture(tmp_path, clock)
    candidates = [candidate]
    if mutation == "duplicate":
        candidates.append(candidate.model_copy(deep=True))
    elif mutation == "tampered":
        candidate.route.energy_budget_wh += 1
    elif mutation == "wrong_task":
        candidate.task_id = "OTHER"
    elif mutation == "wrong_mode":
        candidate.run_mode = "integration"
    else:
        candidate.cached_at = clock() + timedelta(seconds=1)
    with pytest.raises(ValueError):
        cache.save(task, candidates, run_mode="mock")
    assert not cache.path.exists()


def test_loaded_but_expired_cache_still_cannot_be_selected(tmp_path, clock):
    tools, task, observation, candidate, cache = cache_fixture(tmp_path, clock)
    candidate.route.valid_until = clock()
    # Invalidate before saving: the report's candidate digest must be updated
    # by the fixture validator to represent an independently checked candidate.
    from agent.contracts import route_digest

    candidate.validation.route_digest = route_digest(candidate.route)
    cache.save(task, [candidate], run_mode="mock")
    loaded = cache.load(task_id=task.task_id, run_mode="mock")
    with EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock) as edge:
        assert edge.choose_fallback(task, observation, loaded.candidates).action == "no_valid_fallback"


def test_integration_adapters_cannot_use_mock_fallback_candidate(tmp_path, clock):
    tools, task, observation, candidate, _ = cache_fixture(tmp_path, clock)
    tools.is_mock = False
    with EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock) as edge:
        result = edge.choose_fallback(task, observation, [candidate])
    assert result.action == "no_valid_fallback" and "mode" in result.rejected_candidates[0]


@pytest.mark.parametrize("with_check", [False, True])
def test_time_limited_task_requires_explicit_independent_time_check(tmp_path, clock, with_check):
    class TimeAware(FixtureTools):
        def verify_route(self, request):
            report = super().verify_route(request)
            if with_check:
                report.checks.append(
                    ConstraintCheck(name="time_limit", passed=True, detail="fixture within deadline")
                )
            return report

    tools = TimeAware(clock=clock)
    task = fixture_task(clock())
    task.time_limit_s = 90
    with TaskAgent(tools, tmp_path / "timed.jsonl", clock=clock) as agent:
        result = agent.run(task)
    assert result.status is (AgentStatus.ACKNOWLEDGED if with_check else AgentStatus.BLOCKED)
    assert len(tools.submitted) == (1 if with_check else 0)


def test_poll_detects_clock_rollback_even_without_new_heartbeat(clock):
    monitor = CloudLinkMonitor(clock=clock)
    clock.advance(2)
    monitor.poll()
    clock.advance(-1)
    with pytest.raises(ValueError, match="backwards"):
        monitor.poll()


def test_recovery_gate_requires_matching_successful_reconciliation(clock):
    monitor = CloudLinkMonitor(clock=clock, policy=LinkPolicy(healthy_samples_to_recover=1))
    clock.advance(5)
    assert monitor.poll().requires_reconciliation
    clock.advance(1)
    monitor.observe(LinkSample(received_at=clock(), round_trip_ms=20))
    bad = EdgeDecision(
        action="reconcile_required", task_id="T", reason="versions differ", run_mode="mock", is_simulated=True
    )
    with pytest.raises(ValueError, match="successful"):
        monitor.mark_reconciled(bad, task_id="T")
    assert monitor.poll().requires_reconciliation


def test_fallback_cannot_roll_back_to_an_older_plan_version(tmp_path, clock):
    tools, task, observation, candidate, _ = cache_fixture(tmp_path, clock)
    candidate.based_on_plan_version = "v3"
    observation.state.executing_plan_version = "v3"
    with EdgeDecisionAgent(tools, tmp_path / "edge.jsonl", clock=clock) as edge:
        result = edge.choose_fallback(task, observation, [candidate])
    assert result.action == "no_valid_fallback" and "newer" in result.rejected_candidates[0]


def test_repair_request_with_wrong_mode_preserves_even_the_torn_tail(tmp_path, clock):
    path, _ = stopped_run(tmp_path, clock)
    with path.open("ab") as stream:
        stream.write(b'{"sequence":')
    before = path.read_bytes()
    tools = FixtureTools(clock=clock)
    tools.is_mock = False
    with pytest.raises(ValueError, match="MOCK"):
        TaskAgent.restore(tools, path, clock=clock, repair_tail=True)
    assert path.read_bytes() == before and not list(tmp_path.glob("*.partial-*"))


def test_cache_checksum_with_non_ascii_input_is_rejected_cleanly(tmp_path, clock):
    _, task, _, candidate, cache = cache_fixture(tmp_path, clock)
    cache.save(task, [candidate], run_mode="mock")
    envelope = json.loads(cache.path.read_text(encoding="utf-8"))
    envelope["sha256"] = "无效摘要"
    cache.path.write_text(json.dumps(envelope), encoding="utf-8")
    with pytest.raises(ValueError, match="checksum"):
        cache.load(task_id=task.task_id, run_mode="mock")
