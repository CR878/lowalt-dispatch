"""Catalogue provenance and user test parameters; synthetic values are test-only."""

import pytest
from pydantic import ValidationError

from services.assistant.vehicles import (
    CustomVehicle,
    VehicleSelection,
    VehicleTestInput,
    catalog,
    evaluate_vehicle,
)


def custom(**changes):
    return {
        "display_name": "Synthetic unit-test aircraft",
        "source": "test fixture, not real platform",
        "max_payload_kg": 5,
        "cruise_speed_mps": 10,
        "max_speed_mps": 15,
        "energy_per_meter_wh": 0.01,
        "battery_capacity_wh": 200,
        "usable_battery_wh": 150,
        "reserve_policy_wh": 30,
        **changes,
    }


def test_catalog_sources_and_missing_energy_are_honest(client):
    response = client.get("/api/assistant/vehicles")
    assert response.status_code == 200
    vehicles = response.json()["vehicles"]
    assert len(vehicles) >= 3
    for v in vehicles:
        assert v["data_status"] == "manufacturer_spec"
        assert v["energy_per_meter_wh"] is None
        assert v["usable_battery_wh"] is None
        assert v["calibrated_at"] is None
        assert v["range_note"]
        for source in v["sources"]:
            assert source["url"].startswith(("https://www.dji.com/", "https://wingcopter.com/"))
            assert len(source["sha256"]) == 64 and source["fetched_at"] and source["excerpts"]
    wing = next(v for v in vehicles if v["id"] == "wingcopter-198")
    assert wing["reference_speed_mps"] == 90 / 3.6
    assert wing["max_speed_mps"] is None and wing["range_payload_kg"] is None


@pytest.mark.parametrize(
    "changes",
    [
        {"max_payload_kg": 0},
        {"source": " "},
        {"cruise_speed_mps": 16},
        {"usable_battery_wh": 201},
        {"reserve_policy_wh": 150},
        {"reserve_policy_wh": 0, "usable_battery_wh": None},
        {"min_temperature_c": 40, "max_temperature_c": 10},
        {"energy_per_meter_wh": -1},
        {"calibrated_at": "2026-11-17"},
        {"cruise_speed_mps": float("inf")},
        {"is_example": False},
    ],
)
def test_custom_inconsistent_or_forged_profiles_rejected(changes):
    with pytest.raises(ValidationError):
        CustomVehicle.model_validate(custom(**changes))


def test_validation_roundtrip_does_not_create_verified_profile(client):
    response = client.post("/api/assistant/vehicles/validate", json=custom())
    assert response.status_code == 200
    assert response.json()["data_status"] == "user_supplied_test"
    profile = response.json()["vehicle"]
    assert "calibrated_at" not in profile
    assert client.post("/api/assistant/vehicles/validate", json=profile).json()["vehicle"] == profile


def test_official_model_exceedance_never_invents_energy(client):
    r = client.post(
        "/api/assistant/vehicles/evaluate",
        json={
            "vehicle_key": "dji-flycart-30",
            "payload_kg": 31,
            "distance_km": 50,
            "wind_speed_mps": 0,
            "wind_direction": "calm",
        },
    )
    assert r.status_code == 200
    value = r.json()
    assert value["status"] == "exceeds_reference"
    assert value["estimate"]["energy_wh"] is None
    assert value["estimate"]["duration_s"] == pytest.approx(50000 / 15)
    assert not value["dispatch_enabled"] and not value["operationally_approved"]


def test_custom_wind_energy_and_negative_budget():
    body = VehicleTestInput.model_validate(
        {
            "custom_vehicle": custom(),
            "payload_kg": 2,
            "distance_km": 10,
            "wind_speed_mps": 5,
            "wind_direction": "headwind",
        }
    )
    value = evaluate_vehicle(body, 10000, wind_speed_mps=5, wind_direction="headwind")
    assert value["estimate"]["duration_s"] == pytest.approx(2000)
    assert value["estimate"]["energy_wh"] == pytest.approx(200)
    assert value["estimate"]["remaining_after_reserve_wh"] == pytest.approx(-80)
    assert value["status"] == "exceeds_reference"
    calm = evaluate_vehicle(body, 10000, wind_speed_mps=0, wind_direction="calm")
    assert calm["estimate"]["energy_wh"] == pytest.approx(100)
    impossible = evaluate_vehicle(body, 10000, wind_speed_mps=10, wind_direction="crosswind")
    assert impossible["estimate"]["status"] == "infeasible"


def test_absent_values_and_ambiguous_selection_not_assumed():
    r = evaluate_vehicle(VehicleSelection(vehicle_key="dji-flycart-30"), None)
    assert all(c["status"] == "unavailable" for c in r["checks"])
    with pytest.raises(ValidationError):
        VehicleSelection(vehicle_key="unknown")
    with pytest.raises(ValidationError):
        VehicleSelection(vehicle_key="dji-flycart-30", custom_vehicle=CustomVehicle.model_validate(custom()))


def test_no_energy_assumption_from_nominal_battery():
    body = VehicleSelection(custom_vehicle=CustomVehicle.model_validate(custom(energy_per_meter_wh=None)))
    r = evaluate_vehicle(body, 1000, wind_speed_mps=0, wind_direction="calm")
    assert r["estimate"]["energy_wh"] is None
    assert r["estimate"]["remaining_after_reserve_wh"] is None


def test_future_catalog_has_no_side_effect_on_frozen_vehicle():
    from sim.energy import IncompleteVehicleProfile, load_vehicle

    with pytest.raises(IncompleteVehicleProfile):
        load_vehicle()
    assert len(catalog()["vehicles"]) >= 3
