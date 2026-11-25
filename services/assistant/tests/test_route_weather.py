"""Deterministic weather fixtures are explicitly test data, never live evidence."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from services.assistant import evidence, route_weather
from sim.energy import (
    VehicleProfile,
    ground_speed_mps,
    moist_air_density_kg_m3,
    wind_leg_energy_wh,
    wind_sensitivity,
)


def forecast_payload(start="2026-11-18T00:00:00+00:00", *, speed=4.0, direction=270.0):
    instant = datetime.fromisoformat(start)
    hourly = {field: [0.0] * 12 for field in evidence.HOURLY_FIELDS}
    hourly.update(
        {
            "time": [
                (instant + timedelta(hours=i)).replace(tzinfo=None).isoformat(timespec="minutes")
                for i in range(12)
            ],
            "wind_speed_10m": [speed] * 12,
            "wind_direction_10m": [direction] * 12,
            "wind_speed_120m": [speed] * 12,
            "wind_direction_120m": [direction] * 12,
            "temperature_2m": [20.0] * 12,
            "relative_humidity_2m": [50.0] * 12,
            "surface_pressure": [1013.25] * 12,
        }
    )
    return {"hourly": hourly, "utc_offset_seconds": 0, "latitude": 31.2, "longitude": 121.4}


def as_batch(payload):
    """Return one object for a single point and a list for a multi-point batch."""

    def handler(request):
        latitudes = [part for part in str(request.url.params.get("latitude", "")).split(",") if part]
        if len(latitudes) <= 1:
            body = payload
        else:
            body = [json.loads(json.dumps(payload)) for _ in latitudes]
        return httpx.Response(200, json=body)

    return handler


def calibrated_test_profile():
    # Test fixture only. These numbers are NOT a real aircraft registration.
    return VehicleProfile(
        vehicle_key="test-only",
        max_payload_kg=1.0,
        cruise_speed_mps=12.0,
        climb_rate_mps=2.0,
        energy_per_meter_wh=0.05,
        energy_per_second_hover_wh=0.5,
        usable_battery_wh=300.0,
        reserve_policy_wh=30.0,
        source="test-only calibration fixture",
        calibrated_at="2026-11-01",
    )


def test_forecast_interpolates_actual_instant_and_requests_si_units():
    payload = forecast_payload()
    payload["hourly"]["temperature_2m"][1] = 24.0
    payload["hourly"]["wind_direction_10m"][0:2] = [350.0, 10.0]

    def handler(request):
        assert request.url.params["wind_speed_unit"] == "ms"
        assert request.url.params["timezone"] == "UTC"
        assert "wind_direction_10m" in request.url.params["hourly"]
        return httpx.Response(200, json=payload)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = evidence.fetch_weather_forecast(
            31.2, 121.4, "2026-11-18T08:30:00+08:00", client=client, include_hourly=True
        )
    assert result["status"] == "ok"
    assert result["valid_for"] == "2026-11-18T00:30:00+00:00"
    assert result["values"]["temperature_2m"] == 22.0
    assert (
        min(result["values"]["wind_direction_10m"], abs(result["values"]["wind_direction_10m"] - 360)) < 1e-8
    )
    assert result["values"]["wind_speed_10m"] == pytest.approx(
        4 * __import__("math").cos(__import__("math").radians(10))
    )


def test_unscheduled_forecast_uses_now_not_midnight():
    now = datetime.now(UTC)
    start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    payload = forecast_payload(start.isoformat())
    payload["hourly"]["temperature_2m"] = list(range(12))
    with httpx.Client(transport=httpx.MockTransport(as_batch(payload))) as client:
        result = evidence.fetch_weather_forecast(31.2, 121.4, client=client)
    assert result["status"] == "ok"
    assert abs((datetime.fromisoformat(result["valid_for"]) - now).total_seconds()) < 5
    assert result["values"]["temperature_2m"] >= 1


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {"hourly": {"time": []}},
        {"hourly": 3},
        {"hourly": {"time": [1, 2, 3]}},
        {"hourly": {"time": "2026-11-18T00:00"}},
        {"hourly": {"time": ["2026-11-18T00:00"], "temperature_2m": {"bad": 1}}},
    ],
)
def test_malformed_forecast_is_unavailable(payload):
    with httpx.Client(transport=httpx.MockTransport(as_batch(payload))) as client:
        result = evidence.fetch_weather_forecast(31.2, 121.4, "2026-11-18T00:00:00Z", client=client)
    assert result["status"] == "unavailable"
    assert result["values"] == {}


@pytest.mark.parametrize("when", ["2026-11-17T23:59:00Z", "2026-12-30T08:00:00+08:00", "bad-date"])
def test_forecast_never_extrapolates(when):
    with httpx.Client(transport=httpx.MockTransport(as_batch(forecast_payload()))) as client:
        result = evidence.fetch_weather_forecast(31.2, 121.4, when, client=client)
    assert result["status"] == "unavailable"
    assert result["values"] == {}


def test_wind_triangle_and_energy_sensitivity():
    profile = calibrated_test_profile()
    tail = wind_leg_energy_wh(profile, 30000, 90, 4, 270)
    head = wind_leg_energy_wh(profile, 30000, 90, 4, 90)
    cross = wind_leg_energy_wh(profile, 30000, 90, 4, 0)
    calm = wind_leg_energy_wh(profile, 30000, 90, 0, 0)
    assert tail["ground_speed_mps"] == 16
    assert head["ground_speed_mps"] == 8
    assert tail["duration_s"] < calm["duration_s"] < cross["duration_s"] < head["duration_s"]
    assert head["energy_wh"] / tail["energy_wh"] > 1.05
    assert calm["energy_wh"] == pytest.approx(1500)
    assert len(wind_sensitivity(profile, 30000, 4)) == 4
    with pytest.raises(ValueError, match="侧风"):
        ground_speed_mps(12, 90, 12, 0)
    with pytest.raises(ValueError, match="逆风"):
        ground_speed_mps(12, 90, 13, 90)


def test_temperature_and_humidity_change_density_and_induced_power():
    dry = moist_air_density_kg_m3(20, 0, 1013.25)
    moist = moist_air_density_kg_m3(20, 100, 1013.25)
    warm = moist_air_density_kg_m3(35, 50, 1013.25)
    cool = moist_air_density_kg_m3(5, 50, 1013.25)
    assert dry == pytest.approx(1.204, abs=0.002)
    assert moist < dry
    assert warm < cool
    assert (
        route_weather._atmosphere(
            {"temperature_2m": 35, "relative_humidity_2m": 50, "surface_pressure": 1013.25}
        )["ideal_induced_power_ratio_to_isa_sea_level"]
        > 1
    )
    assert route_weather._atmosphere({"temperature_2m": 20})["status"] == "unavailable"


def test_weather_without_real_vehicle_never_invents_eta_or_power():
    with httpx.Client(transport=httpx.MockTransport(as_batch(forecast_payload()))) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.6, 31.2)], "2026-11-18T08:00:00+08:00", client=client
        )
    assert result["status"] == "unavailable"
    length = route_weather._distance((121.3, 31.2), (121.6, 31.2))
    assert len(result["samples"]) == route_weather.sample_count_for(length, route_weather.auto_step_m(length))
    assert all(sample["eta"] is None for sample in result["samples"])
    assert result["energy"]["status"] == "unavailable"
    assert "energy_wh" not in result["energy"]
    assert result["flight_feasibility"]["status"] == "unavailable"
    assert result["constraints_evaluated"] is False
    assert result["dispatch_enabled"] is False


def test_missing_forecast_wind_never_assumes_calm(monkeypatch):
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    payload = forecast_payload()
    for field in ("wind_speed_10m", "wind_direction_10m", "wind_speed_120m", "wind_direction_120m"):
        payload["hourly"][field] = [None] * 12
    with httpx.Client(transport=httpx.MockTransport(as_batch(payload))) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.6, 31.2)],
            "2026-11-18T08:00:00+08:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["status"] == "unavailable"
    assert all(sample["values"].get("wind_speed_10m") is None for sample in result["samples"])
    assert all(sample["values"].get("wind_speed_120m") is None for sample in result["samples"])
    assert result["energy"].get("energy_wh") is None


@pytest.mark.parametrize("field,invalid", [("wind_speed_10m", -2), ("wind_direction_10m", 450)])
def test_invalid_wind_is_not_normalized_into_valid_evidence(field, invalid, monkeypatch):
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    payload = forecast_payload()
    payload["hourly"][field] = [invalid] * 12
    paired = "wind_speed_120m" if "speed" in field else "wind_direction_120m"
    payload["hourly"][paired] = [invalid] * 12
    with httpx.Client(transport=httpx.MockTransport(as_batch(payload))) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.6, 31.2)],
            "2026-11-18T08:00:00+08:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["status"] == "unavailable"
    assert all(sample["values"][field] is None for sample in result["samples"])


def test_calibrated_profile_interpolates_leg_times_and_returns_sensitivity(monkeypatch):
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    with httpx.Client(transport=httpx.MockTransport(as_batch(forecast_payload()))) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.6, 31.2)],
            "2026-11-18T08:00:00+08:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["energy"]["status"] == "conditional"
    assert result["energy"]["duration_s"] > 0
    assert result["energy"]["energy_wh"] > 0
    assert len(result["energy"]["sensitivity"]) == 4
    leg = result["energy"]["legs"][0]
    assert datetime.fromisoformat(leg["arrival_at"]) > datetime.fromisoformat(leg["departure_at"])
    assert leg["atmosphere_start"]["status"] == "model"
    assert result["flight_feasibility"]["status"] == "conditional"


def test_wind_prevents_flight_with_calibrated_profile(monkeypatch):
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    with httpx.Client(
        transport=httpx.MockTransport(as_batch(forecast_payload(speed=20, direction=90)))
    ) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.6, 31.2)],
            "2026-11-18T08:00:00+08:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["energy"]["status"] == "infeasible"
    assert result["flight_feasibility"]["status"] == "infeasible"


def test_example_or_unregistered_profile_is_rejected():
    profile, reason = route_weather._load_real_profile("example_not_real")
    assert profile is None
    assert reason


def test_manual_energy_with_real_forecast_is_labeled_user_test():
    from services.assistant.vehicles import CustomVehicle

    profile = CustomVehicle(
        display_name="test fixture",
        source="synthetic test only",
        max_payload_kg=5,
        cruise_speed_mps=12,
        energy_per_meter_wh=0.01,
        usable_battery_wh=100,
        reserve_policy_wh=20,
    )
    with httpx.Client(transport=httpx.MockTransport(as_batch(forecast_payload()))) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.6, 31.2)], "2026-11-18T08:00:00+08:00", custom_vehicle=profile, client=client
        )
    assert result["energy"]["status"] == "user_test"
    assert result["energy"]["vehicle_calibrated_at"] is None
    assert result["energy"]["budget_status"] == "exceeded"
    assert result["energy"]["remaining_after_reserve_wh"] < 0
    assert not result["dispatch_enabled"]
