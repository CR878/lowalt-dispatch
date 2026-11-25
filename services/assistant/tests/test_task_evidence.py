"""Frozen figures remain traceable to independent validation, not model prose."""

import json
from pathlib import Path

import pytest

from core.models import RiskSnapshot, RoutePlan, Task
from planner.scene import load_scene
from services.assistant import task_evidence
from services.assistant.engine import Engine, Settings
from services.assistant.presentation import Presentation
from services.assistant.tests.test_assistant import FakeModel, make_turn, tool_call
from sim.energy import load_vehicle
from validator.checks import validate_route


@pytest.mark.parametrize("case", ["main", "contrast"])
def test_frozen_artifact_matches_independent_validator(case):
    bundle = json.loads(task_evidence.ARTIFACT.read_text(encoding="utf-8"))
    item = task_evidence.read_task_evidence(case)
    assert item["status"] == "ok"
    source = bundle["inputs"][case]
    task = Task.model_validate(source["task"])
    snapshot = RiskSnapshot.model_validate(source["snapshot"])
    route = RoutePlan.model_validate(source["route"])
    report = validate_route(
        route,
        task,
        snapshot,
        load_scene(),
        profile=load_vehicle(Path("scenarios/vehicles/example_not_real.yaml")),
        now=snapshot.captured_at,
    )
    assert [c.model_dump() for c in report.checks] == item["evidence"]["checks"]
    assert report.route_digest == item["evidence"]["route_digest"]
    assert all(c.passed for c in report.checks) == (case == "main")
    assert item["evidence"]["samples"][-1]["point"] == item["evidence"]["waypoints"][-1]
    assert item["evidence"]["samples"][-1]["s_m"] == pytest.approx(item["evidence"]["length_m"])


@pytest.mark.parametrize("change", ["content", "source", "version", "missing"])
def test_unavailable_artifacts_never_produce_a_pass_card(tmp_path, monkeypatch, change):
    bundle = json.loads(task_evidence.ARTIFACT.read_text(encoding="utf-8"))
    path = tmp_path / "evidence.json"
    if change == "content":
        bundle["cases"]["contrast"]["verdict"] = "passed"
    elif change == "source":
        bundle["source_hashes"]["planner/diversion.py"] = "0" * 64
    elif change == "version":
        bundle["version"] = 99
    if change != "missing":
        path.write_text(json.dumps(bundle), encoding="utf-8")
    monkeypatch.setattr(task_evidence, "ARTIFACT", path)
    assert task_evidence.read_task_evidence("contrast")["status"] == "unavailable"


def test_rules_and_model_paths_both_render_the_shared_contract():
    local = Engine(Settings()).run(make_turn("给我任务证据卡"), lambda _: None)
    card = Presentation.model_validate(local["presentation"]).blocks[0]
    assert card.type == "task_evidence"
    assert card.evidence.task_id == "T-S1-02"
    model = FakeModel([tool_call("get_task_evidence", {"case": "contrast"}), {"content": "可以起飞"}])
    result = Engine(Settings(provider="maas"), model).run(
        make_turn("显示拒绝案例的任务证据卡"), lambda _: None
    )
    assert result["presentation"]["blocks"][0]["evidence"]["verdict"] == "rejected"
    assert "可以起飞" not in result["text"]
    assert "独立校验拒绝" in result["text"]
