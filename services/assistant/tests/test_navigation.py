from __future__ import annotations

import pytest
from pydantic import ValidationError

from services.assistant.navigation import CandidateInput, candidate_routes, collapse_collinear


def test_candidates_use_real_astar_without_dispatch():
    body = CandidateInput.model_validate(
        {"origin": {"x": 150, "y": 150}, "destination": {"x": 2800, "y": 2800}, "frame": "ENU"}
    )
    result = candidate_routes(body)
    assert result["dispatch_enabled"] is False
    assert [a["clearance_m"] for a in result["alternatives"]] == [30, 60]
    available = [a for a in result["alternatives"] if a["available"]]
    assert available
    for alternative in available:
        route = alternative["route"]
        assert route["frame"] == "ENU"
        assert route["is_simulated"] is True
        assert route["task_id"] is route["plan_version"] is None
        assert len(route["waypoints"]) >= 2
        assert "altitude" not in route["waypoints"][0]
    assert collapse_collinear([(0, 0), (10, 0), (20, 0), (20, 10)]) == [(0, 0), (20, 0), (20, 10)]
    assert collapse_collinear([(0, 0), (10, 0), (5, 0)]) == [(0, 0), (10, 0), (5, 0)]


@pytest.mark.parametrize(
    "overrides",
    [
        {"frame": "WGS84"},
        {"origin": {"x": -1, "y": 150}},
        {"destination": {"x": 150, "y": 150}},
        {"origin": {"x": float("nan"), "y": 150}},
    ],
)
def test_real_coordinates_and_invalid_endpoints_are_rejected(overrides):
    with pytest.raises(ValidationError):
        CandidateInput.model_validate(
            {"origin": {"x": 150, "y": 150}, "destination": {"x": 2800, "y": 2800}, "frame": "ENU"}
            | overrides
        )


def test_blocked_endpoint_is_not_silently_moved():
    result = candidate_routes(
        CandidateInput.model_validate(
            {"origin": {"x": 1500, "y": 1500}, "destination": {"x": 2800, "y": 2800}, "frame": "ENU"}
        )
    )
    assert all(not a["available"] and a["route"] is None for a in result["alternatives"])


def test_candidate_api_is_authenticated_and_rejects_wgs84(client):
    body = {"origin": {"x": 150, "y": 150}, "destination": {"x": 2800, "y": 2800}, "frame": "ENU"}
    response = client.post("/api/assistant/navigation/candidates", json=body)
    assert response.status_code == 200
    assert response.json()["dispatch_enabled"] is False
    assert (
        client.post("/api/assistant/navigation/candidates", json=body | {"frame": "WGS84"}).status_code == 422
    )
    client.post("/api/auth/logout", json={})
    assert client.post("/api/assistant/navigation/candidates", json=body).status_code == 401
