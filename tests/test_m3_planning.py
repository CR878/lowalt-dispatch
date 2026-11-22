from __future__ import annotations

from datetime import UTC, datetime

import pytest

pytest.importorskip("sqlalchemy")

from agent.contracts import PlanningRequest
from agent.integration import run_demo
from agent.planning import M2Tools
from planner.assemble import build_snapshot, build_task
from planner.scene import load_scene, load_suite

NOW = datetime(2026, 11, 10, tzinfo=UTC)


def test_real_m2_bridge_and_idempotent_dispatch(tmp_path):
    summary = run_demo("S1-01", tmp_path)
    assert summary["run_mode"] == "mock"
    assert summary["result"]["status"] == "acknowledged"
    assert summary["submission_count"] == 1
    assert summary["result"]["run_id"] == summary["duplicate_run_id"]
    assert summary["result"]["route"]["algorithm"] == "astar_static"
    assert summary["sync_errors"] == []


def test_real_validator_rejection_does_not_reach_executor(tmp_path):
    summary = run_demo("S2-01", tmp_path)
    assert summary["result"]["status"] == "blocked"
    assert summary["submission_count"] == 0
    assert "feedback" in summary["result"]["reason"]


def test_missing_profile_never_invents_energy():
    scene = load_scene()
    scenario = load_suite()["scenarios"][0]
    snapshot = build_snapshot(scenario, scene, NOW)
    task = build_task(scenario, NOW, vehicle_type="placeholder", initial_energy_wh=400, reserve_energy_wh=80)
    tools = M2Tools(
        scene, lambda _: snapshot, lambda _: pytest.fail("must not submit"), profile=None, is_mock=True
    )
    result = tools.plan_route(PlanningRequest(task=task, snapshot=snapshot, plan_version="v1", attempt=1))
    assert result.route is None and "profile missing" in result.reason


def test_current_state_validation_requires_m2_upgrade():
    scene = load_scene()
    tools = M2Tools(scene, lambda _: None, lambda _: None, profile=None, is_mock=True)

    # Fail before any full-route validation is used as a fallback approval.
    class Request:
        vehicle_state = object()

    with pytest.raises(NotImplementedError, match="current telemetry"):
        tools.verify_route(Request())
