"""Integration fixtures are deliberately synthetic; live evidence is stored separately."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from services.assistant import osm_obstacles, route_weather
from services.assistant.navigation import CandidateInput, candidate_routes


def body():
    return {
        "frame": "WGS84",
        "origin": {"lng": 121.46, "lat": 31.22},
        "destination": {"lng": 121.48, "lat": 31.22},
    }


@pytest.fixture
def dataset(monkeypatch):
    obstacle = {
        "type": "Feature",
        "properties": {"height_source": "estimate", "height_m": None},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [121.469, 31.219],
                    [121.471, 31.219],
                    [121.471, 31.221],
                    [121.469, 31.221],
                    [121.469, 31.219],
                ]
            ],
        },
    }
    data = {
        "obstacles": {
            "type": "FeatureCollection",
            "bbox": [121.44, 31.20, 121.50, 31.24],
            "features": [obstacle],
        },
        "roads": {"type": "FeatureCollection", "features": []},
        "metadata": {"scene_id": "f" * 16, "source": "test fixture; never live data", "fetched_at": "test"},
        "warnings": ["fixture height unknown"],
    }
    monkeypatch.setattr(osm_obstacles, "fetch_obstacles", lambda *args, **kwargs: data)
    monkeypatch.setattr(
        route_weather,
        "assess_route_weather",
        lambda *args, **kwargs: {
            "status": "unavailable",
            "source": "test forecast unavailable",
            "warnings": ["no forecast"],
            "energy": {"status": "unavailable", "reason": "no calibrated vehicle"},
        },
    )
    return data


def test_wgs84_avoids_building_and_preserves_exact_endpoints(dataset):
    result = candidate_routes(CandidateInput.model_validate(body()))
    assert result["dispatch_enabled"] is False
    assert result["is_simulated"] is False
    assert result["airspace"]["status"] == "manual_review_required"
    assert result["weather"]["status"] == "unavailable"
    assert result["obstacle_source"] == dataset["metadata"]["source"]
    route = result["route"]
    assert route["frame"] == "WGS84" and len(route["waypoints"]) > 2
    for p, expected in (
        (route["waypoints"][0], body()["origin"]),
        (route["waypoints"][-1], body()["destination"]),
    ):
        assert p["lng"] == pytest.approx(expected["lng"])
        assert p["lat"] == pytest.approx(expected["lat"])
    assert "altitude" not in route["waypoints"][0]


def test_real_endpoint_inside_building_does_not_move(dataset):
    request = body() | {"origin": {"lng": 121.470, "lat": 31.22}}
    result = candidate_routes(CandidateInput.model_validate(request))
    assert result["route"] is None
    assert result["status"] == "no_route"
    assert "未移动端点" in result["alternatives"][0]["reason"]


def test_selected_vehicle_and_payload_reach_route_assessment(dataset, monkeypatch):
    calls = []

    def weather(points, scheduled_for, **kwargs):
        calls.append(kwargs)
        return {"status": "unavailable", "source": "test forecast unavailable", "warnings": []}

    monkeypatch.setattr(route_weather, "assess_route_weather", weather)
    request = body() | {"vehicle_key": "dji-flycart-30", "payload_kg": 35}
    result = candidate_routes(CandidateInput.model_validate(request))
    assert result["route"]
    assert result["vehicle_assessment"]["status"] == "exceeds_reference"
    assert result["vehicle_assessment"]["vehicle"]["id"] == "dji-flycart-30"
    assert result["vehicle_assessment"]["distance_m"] == result["route"]["length_m"]
    assert calls[-1]["vehicle_key"] == "dji-flycart-30"
    custom = {
        "display_name": "test",
        "source": "synthetic test fixture",
        "max_payload_kg": 2,
        "cruise_speed_mps": 10,
    }
    result = candidate_routes(
        CandidateInput.model_validate(body() | {"custom_vehicle": custom, "payload_kg": 1})
    )
    assert calls[-1]["custom_vehicle"].display_name == "test"
    assert result["vehicle_assessment"]["vehicle"]["data_status"] == "user_supplied_test"
    assert not result["operationally_approved"]


def test_coarse_resolution_falls_back_to_10m(dataset, monkeypatch):
    calls = []

    def fake_plan(origin, destination, obstacles, **kwargs):
        calls.append(kwargs["resolution_m"])
        found = kwargs["resolution_m"] == 10
        return {
            "found": found,
            "waypoints": [origin, destination] if found else [],
            "length_m": 100.0 if found else 0.0,
            "clearance_m": 20.0,
            "resolution_m": kwargs["resolution_m"],
            "nodes_expanded": 127340 if not found else 57697,
            "elapsed_ms": 12.0,
            "continuous_clearance_verified": found,
            "grid_clearance_m": 20.0 + kwargs["resolution_m"] / 2**0.5,
            "reason": None if found else "搜索空间耗尽，无可行路线",
            "warnings": [],
        }

    monkeypatch.setattr("planner.real.plan_real_route", fake_plan)
    result = candidate_routes(CandidateInput.model_validate(body() | {"resolution_m": 20}))
    assert calls == [20, 10]
    assert result["status"] == "ok"
    assert result["resolution_requested_m"] == 20
    assert result["resolution_used_m"] == 10
    assert [item["resolution_m"] for item in result["plan_attempts"]] == [20, 10]
    assert result["plan_attempts"][0]["found"] is False
    assert any("自动改用" in warning and "净空标准未降低" in warning for warning in result["warnings"])


def test_coarse_and_fine_both_blocked_reports_every_attempt(dataset, monkeypatch):
    def fake_plan(origin, destination, obstacles, **kwargs):
        return {
            "found": False,
            "waypoints": [],
            "length_m": 0.0,
            "clearance_m": 20.0,
            "resolution_m": kwargs["resolution_m"],
            "nodes_expanded": 52070,
            "elapsed_ms": 9.0,
            "grid_clearance_m": 20.0 + kwargs["resolution_m"] / 2**0.5,
            "reason": "搜索空间耗尽，无可行路线",
            "warnings": [],
        }

    monkeypatch.setattr("planner.real.plan_real_route", fake_plan)
    result = candidate_routes(CandidateInput.model_validate(body() | {"resolution_m": 30}))
    assert result["status"] == "no_route"
    assert result["route"] is None
    assert [item["resolution_m"] for item in result["plan_attempts"]] == [30, 10]
    assert result["alternatives"][0]["reason"] == "搜索空间耗尽，无可行路线"


def test_real_api_and_cached_scene(client, dataset, monkeypatch):
    response = client.post("/api/assistant/navigation/candidates", json=body())
    assert response.status_code == 200
    assert response.json()["route"]["frame"] == "WGS84"
    monkeypatch.setattr(osm_obstacles, "load_cached_scene", lambda scene_id: dataset)
    assert client.get("/api/assistant/navigation/scenes/" + "f" * 16).json()["obstacles"]["features"]


def test_no_fake_fallback_on_osm_failure(client, monkeypatch):
    def fail(*args, **kwargs):
        raise osm_obstacles.OSMDataUnavailable("test upstream failure")

    monkeypatch.setattr(osm_obstacles, "fetch_obstacles", fail)
    response = client.post("/api/assistant/navigation/candidates", json=body())
    assert response.status_code == 503
    assert response.json()["detail"]["dispatch_enabled"] is False
    assert "test upstream failure" in response.json()["detail"]["reason"]
    assert client.get("/api/assistant/navigation/scenes/not-a-scene").status_code == 404


@pytest.mark.parametrize(
    "change",
    [
        {"origin": {"x": 150, "y": 150}},
        {"destination": {"lng": 140, "lat": 32}},
        {"scheduled_for": "2026-11-17T12:00:00"},
        {"origin": {"lng": float("nan"), "lat": 31}},
    ],
)
def test_real_input_rejects_ambiguous_or_unbounded_values(change):
    with pytest.raises(ValidationError):
        CandidateInput.model_validate(body() | change)
