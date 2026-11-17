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
