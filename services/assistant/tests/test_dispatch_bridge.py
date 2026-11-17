"""Intake → Task draft: every missing number must block, never be invented."""

from __future__ import annotations

import pytest

from services.assistant import app as app_module
from services.assistant.dispatch_bridge import DispatchDraftInput, build_task_draft
from services.assistant.intake import IntakeStore


def intake(**overrides):
    record = {
        "intake_id": "intake-test-1",
        "origin": {
            "name": "上海虹桥国际机场",
            "point": [121.335209, 31.19795],
            "crs": "EPSG:4326",
            "source": "test",
            "is_simulated": False,
        },
        "destination": {
            "name": "上海浦东国际机场",
            "point": [121.8044, 31.144383],
            "crs": "EPSG:4326",
            "source": "test",
            "is_simulated": False,
        },
        "payload_kg": 5.4,
        "real_route": {"status": "ok", "waypoints": [{"lng": 121.3, "lat": 31.2}], "length_m": 50994.0},
        "is_simulated": True,
        "dispatch_enabled": False,
    }
    return record | overrides


def complete_body() -> DispatchDraftInput:
    return DispatchDraftInput(
        vehicle_type="dji-flycart-30",
        alt_m=120.0,
        alt_ref="rel_takeoff",
        initial_energy_wh=1800.0,
        reserve_energy_wh=300.0,
        time_limit_s=3600,
        energy_source="人工假设，仅用于联调",
    )


def test_missing_everything_blocks_without_inventing():
    result = build_task_draft(intake(payload_kg=None, real_route=None), DispatchDraftInput())
    codes = {item["code"] for item in result["blockers"]}
    assert result["status"] == "blocked"
    assert result["task"] is None
    assert {
        "missing_payload",
        "missing_vehicle",
        "missing_altitude",
        "missing_energy",
        "no_real_route",
    } <= codes
    assert result["dispatch_enabled"] is False
    assert any("不代表获准飞行" in warning for warning in result["warnings"])


def test_complete_inputs_produce_valid_wgs84_task():
    result = build_task_draft(intake(), complete_body())
    assert result["status"] == "draft_ready", result["blockers"]
    task = result["task"]
    assert task["origin"]["frame"] == "wgs84"
    assert task["origin"]["lat_deg"] == pytest.approx(31.19795)
    assert task["destination"]["lon_deg"] == pytest.approx(121.8044)
    assert task["payload_kg"] == 5.4
    assert task["vehicle_type"] == "dji-flycart-30"
    assert task["provenance"]["source"] == "assistant_intake:intake-test-1"
    assert task["provenance"]["is_simulated"] is True
    assert "人工假设" in task["provenance"]["uncertainty_note"]
    assert result["dispatch_enabled"] is False
    codes = {item["code"] for item in result["execution_blockers"]}
    assert {"no_enu_origin", "airspace_manual_review", "no_flight_control"} <= codes


def test_reserve_energy_must_be_below_initial():
    body = complete_body().model_copy(update={"reserve_energy_wh": 1800.0})
    result = build_task_draft(intake(), body)
    assert result["status"] == "blocked"
    assert {item["code"] for item in result["blockers"]} == {"invalid_energy"}


def test_route_failure_blocks_draft():
    result = build_task_draft(
        intake(real_route={"status": "unavailable", "reason": "Overpass 502"}),
        complete_body(),
    )
    assert result["status"] == "blocked"
    blocker = next(item for item in result["blockers"] if item["code"] == "no_real_route")
    assert "Overpass 502" in blocker["detail"]
    assert "未用直线" in blocker["detail"]


def test_dispatch_draft_endpoint(client, tmp_path, monkeypatch):
    store = IntakeStore(root=tmp_path / "intakes")
    monkeypatch.setattr(app_module, "intake_store", store)
    from services.assistant.intake import IntakeCreate, PlaceEvidence, TaskIntake, WeatherEvidence

    record = TaskIntake.build(
        IntakeCreate(
            text="从虹桥送到浦东",
            origin="虹桥",
            destination="浦东",
            payload_kg=5.4,
            priority="P2",
        ),
        origin=PlaceEvidence(
            name="虹桥", point=[121.335209, 31.19795], crs="EPSG:4326", source="test", is_simulated=False
        ),
        destination=PlaceEvidence(
            name="浦东", point=[121.8044, 31.144383], crs="EPSG:4326", source="test", is_simulated=False
        ),
        weather=WeatherEvidence(),
        airspace={"status": "draft"},
        route_preview=None,
        real_route={"status": "ok", "waypoints": [], "length_m": 1.0},
        warnings=[],
    )
    store.create(record)
    response = client.post(
        f"/api/assistant/intakes/{record.intake_id}/dispatch-draft",
        json={
            "vehicle_type": "dji-flycart-30",
            "alt_m": 120,
            "alt_ref": "rel_takeoff",
            "initial_energy_wh": 1800,
            "reserve_energy_wh": 300,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft_ready"
    assert body["task"]["task_id"]
    assert body["dispatch_enabled"] is False

    missing = client.post(f"/api/assistant/intakes/{record.intake_id}/dispatch-draft", json={})
    assert missing.json()["status"] == "blocked"
    assert client.post("/api/assistant/intakes/nope/dispatch-draft", json={}).status_code == 404


def test_refresh_route_endpoint_writes_cached_route(client, tmp_path, monkeypatch):
    store = IntakeStore(root=tmp_path / "intakes")
    monkeypatch.setattr(app_module, "intake_store", store)
    from services.assistant.intake import IntakeCreate, PlaceEvidence, TaskIntake, WeatherEvidence

    record = TaskIntake.build(
        IntakeCreate(text="补算航线", origin="虹桥", destination="浦东", payload_kg=1.0),
        origin=PlaceEvidence(
            name="虹桥", point=[121.335209, 31.19795], crs="EPSG:4326", source="test", is_simulated=False
        ),
        destination=PlaceEvidence(
            name="浦东", point=[121.8044, 31.144383], crs="EPSG:4326", source="test", is_simulated=False
        ),
        weather=WeatherEvidence(),
        airspace={"status": "draft"},
        route_preview=None,
        warnings=["真实航线未生成：旧记录"],
    )
    store.create(record)
    monkeypatch.setattr(
        app_module,
        "real_route_for_intake",
        lambda origin, destination, scheduled_for: {
            "status": "ok",
            "frame": "WGS84",
            "waypoints": [
                {"lng": origin[0], "lat": origin[1]},
                {"lng": destination[0], "lat": destination[1]},
            ],
            "length_m": 1000.0,
            "reason": None,
        },
    )
    body = client.post(f"/api/assistant/intakes/{record.intake_id}/route").json()
    assert body["real_route"]["status"] == "ok"
    assert len(body["real_route"]["waypoints"]) == 2
    assert not any("真实航线未生成" in warning for warning in body["warnings"])
    assert any("物理净空" in warning for warning in body["warnings"])
