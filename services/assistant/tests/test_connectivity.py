"""Regressions for the map → saved route → assistant/export data chain."""

import json
from pathlib import Path
from unittest.mock import Mock

import pytest
from shapely.geometry import LineString, Polygon

from planner.diversion import plan_baseline_annotated
from planner.real import plan_real_route
from planner.scene import load_scene, load_suite
from services.assistant import evidence, geocode, navigation
from services.assistant.engine import Engine, Settings
from services.assistant.models import Context
from services.assistant.task_evidence import source_digest
from services.assistant.tests.test_assistant import make_turn
from services.assistant.tools import Toolset, real_route_for_intake
from sim.energy import load_vehicle


def test_source_digest_survives_git_line_ending_normalization(tmp_path):
    source = tmp_path / "source.py"
    source.write_bytes(b"x = 1\r\ny = 2\r\n")
    before = source_digest(source)
    source.write_bytes(b"x = 1\ny = 2\n")
    assert source_digest(source) == before
    source.write_bytes(b"x = 3\ny = 2\n")
    assert source_digest(source) != before


def planning_turn():
    turn = make_turn("查询当前飞行状态和电量")
    turn.context = Context.model_validate(
        {
            **turn.context.model_dump(),
            "telemetry_mode": "planning",
            "telemetry": None,
            "task_id": "intake-123",
            "route_id": "real-123",
            "terrain": None,
            "active_route": {
                "route_id": "real-123",
                "task_id": "intake-123",
                "frame": "WGS84",
                "source": "test saved route",
                "waypoints": [[120, 30], [120.01, 30]],
            },
        }
    )
    return turn


def test_environment_tool_samples_the_visible_route_not_an_endpoint_chord(monkeypatch, tmp_path):
    from services.assistant import environment
    from services.assistant.engine import allowed_tools
    from services.assistant.tools import ENV_TOOL_NAMES

    environment.clear_environment_cache()
    monkeypatch.setattr(environment, "AUDIT_ROOT", tmp_path)
    seen = []

    def forecast(points, *args, **kwargs):
        seen.append(points)
        return {"samples": [], "coverage": {}}

    monkeypatch.setattr(environment, "assess_route_weather", forecast)
    turn = planning_turn()
    turn.context.active_route.waypoints.insert(1, (120.005, 30.005))
    result = Toolset(turn).assess_route_environment(
        environment.EnvQuery(origin=(120, 30), destination=(120.01, 30))
    )
    assert seen[0] == turn.context.active_route.waypoints
    assert result["geometry_scope"] == "provided_route"
    other = Toolset(turn).assess_route_environment(
        environment.EnvQuery(origin=(121, 31), destination=(121.01, 31))
    )
    assert other["geometry_scope"] == "endpoint_corridor"
    assert len(seen[1]) == 2 and "未绑定" in other["geometry_note"]
    assert not (allowed_tools(make_turn("ACK 代表什么？")) & ENV_TOOL_NAMES)


def test_planning_does_not_borrow_demo_flight_or_terrain():
    turn = planning_turn()
    result = Engine(Settings()).run(turn, lambda _: None)
    assert "没有对应任务的电量" in result["text"]
    flight = result["traces"][0]["result"]
    assert flight["telemetry"] is None
    assert flight["route"]["route_id"] == "real-123"
    assert "83.4" not in result["text"]
    assert "未借用" in Toolset(turn).inspect_terrain_risk({})["reason"]


def test_unsafe_model_environment_claim_is_replaced_not_appended(monkeypatch):
    from services.assistant.tests.test_assistant import FakeModel, tool_call

    monkeypatch.setattr(
        Toolset,
        "assess_route_environment",
        lambda *a: {"status": "ok", "verdict": "degraded", "gaps": [{"factor": "airspace"}], "factors": []},
    )
    model = FakeModel(
        [
            tool_call("assess_route_environment", {"origin": [120, 30], "destination": [120.01, 30]}),
            {"content": "这条航线可以放心飞"},
        ]
    )
    result = Engine(Settings(provider="maas"), model).run(make_turn("这条航线能不能飞？"), lambda _: None)
    assert "可以放心飞" not in result["text"]
    assert "degraded" in result["text"] and "1 项" in result["text"]


def test_saved_intake_keeps_route_contract_and_scene(monkeypatch):
    route = {
        "id": "real-test",
        "title": "Test",
        "source": "test OSM",
        "frame": "WGS84",
        "is_simulated": False,
        "waypoints": [{"x": 120, "y": 30}, {"x": 120.01, "y": 30}],
    }
    response = {
        "status": "ok",
        "route": route,
        "scene_id": "same-snapshot",
        "obstacle_source": "test OSM",
        "weather": {"status": "unavailable"},
    }
    monkeypatch.setattr(navigation, "real_candidate_routes", lambda *a, **kw: response)
    stored = real_route_for_intake([120, 30], [120.01, 30], None)
    assert stored["route"] == route
    assert stored["scene_id"] == "same-snapshot"
    assert stored["planning_result"] == response


def test_ambiguous_airport_never_selects_the_first_hotel(monkeypatch):
    lookup = Mock(
        return_value=(
            [{"name": "机场酒店", "point": [121.32, 31.19]}, {"name": "虹桥机场", "point": [121.33, 31.19]}],
            "Photon test",
        )
    )
    monkeypatch.setattr(geocode, "lookup", lookup)
    result = evidence.resolve_place("虹桥机场")
    assert result["status"] == "ambiguous" and result["point"] is None
    assert len(result["candidates"]) == 2
    lookup.assert_called_once_with("虹桥机场", 5)


def test_default_scene_and_profile_are_one_current_run():
    data = json.loads(Path("apps/console/public/demo-scene.json").read_text(encoding="utf-8"))
    plan = plan_baseline_annotated(
        load_suite()["scenarios"][0],
        load_scene(),
        load_vehicle(Path("scenarios/vehicles/example_not_real.yaml")),
    )
    assert data["route"] == [list(p) for p in plan.waypoints]
    assert [s["margin_wh"] for s in data["margin_profile"]] == [s.margin_wh for s in plan.profile.samples]
    assert any(not c["passed"] for c in data["validation_checks"])


def test_imported_region_really_changes_the_route():
    data = {"type": "FeatureCollection", "bbox": [119.99, 29.99, 120.02, 30.01], "features": []}
    ring = [[120.004, 29.999], [120.006, 29.999], [120.006, 30.001], [120.004, 30.001], [120.004, 29.999]]
    exclusion = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]}}],
    }
    route = plan_real_route((120, 30), (120.01, 30), data, exclusions_fc=exclusion)
    assert route["found"]
    assert not LineString(route["waypoints"]).intersects(Polygon(ring))
    assert len(route["waypoints"]) > 2


@pytest.mark.parametrize("coordinates", [None, 123, [[[True, 30], [120, 30], [120, 31], [True, 30]]]])
def test_invalid_region_coordinates_are_validation_errors(coordinates):
    with pytest.raises(ValueError):
        navigation.AvoidRegion(
            id="x", kind="restricted", source="test", geometry={"type": "Polygon", "coordinates": coordinates}
        )
