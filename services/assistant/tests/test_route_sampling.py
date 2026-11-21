"""P1 arc-length sampling and ETA. Every payload here is a fixture, not a live forecast."""

from datetime import UTC, datetime, timedelta
from itertools import pairwise

import httpx
import pytest

from services.assistant import route_weather
from services.assistant.tests.test_route_weather import calibrated_test_profile


def _hours(start="2026-11-18T12:00:00+00:00", hours=8, *, speed=4.0, direction=270.0):
    instant = datetime.fromisoformat(start)
    from services.assistant import evidence

    hourly = {field: [0.0] * hours for field in evidence.HOURLY_FIELDS}
    hourly["time"] = [
        (instant + timedelta(hours=i)).replace(tzinfo=None).isoformat(timespec="minutes") for i in range(hours)
    ]
    hourly.update(
        {
            "wind_speed_10m": [speed] * hours,
            "wind_direction_10m": [direction] * hours,
            "wind_speed_120m": [speed] * hours,
            "wind_direction_120m": [direction] * hours,
            "temperature_2m": [20.0] * hours,
            "relative_humidity_2m": [50.0] * hours,
            "surface_pressure": [1013.25] * hours,
            "wind_gusts_10m": [4.0] * hours,
            "precipitation": [0.0] * hours,
        }
    )
    return {"hourly": hourly, "utc_offset_seconds": 0, "latitude": 31.2, "longitude": 121.4}


def _client(payload_for_index):
    state = {"n": 0}

    def handler(request):
        rows = []
        for _longitude in request.url.params["longitude"].split(","):
            index = state["n"]
            state["n"] += 1
            row = payload_for_index(index)
            rows.append(row)
        return httpx.Response(200, json=rows)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_equal_arc_samples_include_endpoints_and_ignore_zero_length_repeats():
    points = [(121.0, 31.2), (121.0, 31.2), (121.2, 31.2)]
    samples, step, total = route_weather.sample_by_arc_length(points)
    assert samples[0]["point"] == points[0]
    assert samples[-1]["point"] == points[-1]
    assert samples[0]["s_m"] == 0
    assert samples[-1]["s_m"] == pytest.approx(total)
    assert all(samples[i]["s_m"] < samples[i + 1]["s_m"] for i in range(len(samples) - 1))
    assert len(samples) == route_weather.sample_count_for(total, step)
    assert step == pytest.approx(route_weather.auto_step_m(total))


def test_forty_five_kilometres_has_24_uniform_points(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 45000.0)
    samples, step, total = route_weather.sample_by_arc_length([(121.0, 31.2), (121.5, 31.2)])
    assert total == 45000
    assert step == 2000
    assert len(samples) == 24
    assert samples[-1]["s_m"] / 23 == pytest.approx(45000 / 23)
    assert 45000 / 23 <= 2000


def test_t1_twenty_four_points_are_all_available(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 45000.0)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    with _client(lambda index: _hours()) as client:
        result = route_weather.assess_route_weather(
            [(121.0, 31.2), (121.5, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["coverage"]["sample_count"] == 24
    assert result["status"] == "ok"
    assert all(sample["status"] == "ok" for sample in result["samples"])
    assert all(sample["eta"] for sample in result["samples"])
    assert result["environment_verdict"] != "pass"
    assert result["honesty"]["factor_matrix"] == "not_evaluated"
    assert result["dispatch_enabled"] is False
    assert result["operationally_approved"] is False


def test_t2_three_middle_points_stay_unavailable_and_do_not_pass(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 45000.0)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))

    def payload(index):
        row = _hours()
        if index in {10, 11, 12}:
            row["hourly"]["time"] = [
                (datetime(1990, 1, 1, tzinfo=UTC) + timedelta(hours=i)).replace(tzinfo=None).isoformat(timespec="minutes")
                for i in range(8)
            ]
        return row

    with _client(payload) as client:
        result = route_weather.assess_route_weather(
            [(121.0, 31.2), (121.5, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    failed = [sample for sample in result["samples"] if sample["status"] == "unavailable"]
    assert [sample["index"] for sample in failed] == [10, 11, 12]
    assert result["environment_verdict"] != "pass"
    assert result["honesty"]["environment_verdict"] == "not_evaluated"
    assert result["status"] != "ok"


def test_t3_missing_120m_wind_is_labeled_surface_10m_and_not_copied(monkeypatch):
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))

    def payload(index):
        row = _hours(speed=6.0, direction=270.0)
        row["hourly"]["wind_speed_120m"] = [None] * 8
        row["hourly"]["wind_direction_120m"] = [None] * 8
        return row

    with _client(payload) as client:
        result = route_weather.assess_route_weather(
            [(121.30, 31.2), (121.36, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["vertical_wind_source"] == "surface_10m"
    assert result["vertical_wind_degraded"] is True
    assert all(sample["values"].get("wind_speed_120m") is None for sample in result["samples"])
    assert all(sample["values"].get("wind_speed_10m") == 6.0 for sample in result["samples"])
    assert all(sample["values"]["wind_speed_120m"] != sample["values"]["wind_speed_10m"] for sample in result["samples"])


def test_t4_crosswind_above_airspeed_is_infeasible_without_raising(monkeypatch):
    from dataclasses import replace

    profile = replace(calibrated_test_profile(), cruise_speed_mps=8.0)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (profile, ""))

    def payload(index):
        return _hours(speed=9.0, direction=0.0)

    with _client(payload) as client:
        result = route_weather.assess_route_weather(
            [(121.30, 31.2), (121.36, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["flight_feasibility"]["status"] == "infeasible"
    assert "侧风" in result["flight_feasibility"]["reason"]
    assert result["dispatch_enabled"] is False


def test_t5_eta_is_monotonic_and_converges_within_five_iterations(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 12.0 * 4 * 3600)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    with _client(lambda index: _hours(hours=8, speed=0.0, direction=0.0)) as client:
        result = route_weather.assess_route_weather(
            [(121.0, 31.2), (122.2, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    etas = [datetime.fromisoformat(sample["eta"]) for sample in result["samples"]]
    assert all(left < right for left, right in pairwise(etas))
    assert etas[-1] - etas[0] >= timedelta(hours=3)
    provenance = result["provenance"]
    assert provenance["iteration_count"] <= 5
    assert provenance["converged"] is True
    assert provenance["max_eta_delta_s"] < 5
    assert provenance["time_basis"] == "calibrated_airspeed"
    assert provenance["model"] is None
    assert provenance["model_grid_resolution_km"] is None


def test_t16_fixture_dedupes_returned_model_points_and_nulls_when_absent(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 45000.0)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    cells = [(121.10, 31.20), (121.20, 31.20), (121.30, 31.20), (121.40, 31.20)]

    def payload(index):
        row = _hours()
        row["longitude"], row["latitude"] = cells[index % 4]
        return row

    with _client(payload) as client:
        result = route_weather.assess_route_weather(
            [(121.0, 31.2), (121.5, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["coverage"]["sample_count"] == 24
    assert result["coverage"]["independent_cells"] == 4
    assert result["coverage"]["independent_cells"] <= 5
    assert result["coverage"]["model_grid_resolution_km"] is None
    assert result["coverage"]["inferred_spacing_basis"].startswith("proxy_")

    def missing(index):
        row = _hours()
        row["latitude"] = None
        row["longitude"] = None
        return row

    with _client(missing) as client:
        blank = route_weather.assess_route_weather(
            [(121.0, 31.2), (121.5, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    assert blank["coverage"]["independent_cells"] is None
    assert all(sample["model_point"] is None for sample in blank["samples"])
    assert blank["coverage"]["inferred_model_point_spacing_km"] is None


def test_no_speed_keeps_spatial_samples_and_leaves_eta_unavailable(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 45000.0)
    with _client(lambda index: _hours()) as client:
        result = route_weather.assess_route_weather(
            [(121.0, 31.2), (121.5, 31.2)],
            "2026-11-18T12:00:00+00:00",
            client=client,
        )
    assert result["coverage"]["sample_count"] == 24
    assert result["provenance"]["time_basis"] is None
    assert result["provenance"]["speed_mps"] is None
    assert all(sample["eta"] is None for sample in result["samples"])
    assert result["energy"]["status"] == "unavailable"
    assert "energy_wh" not in result["energy"]


def test_catalog_reference_speed_is_labeled_and_does_not_invent_energy():
    with _client(lambda index: _hours()) as client:
        result = route_weather.assess_route_weather(
            [(121.30, 31.2), (121.36, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="dji-flycart-30",
            client=client,
        )
    assert result["provenance"]["time_basis"] == "manufacturer_reference"
    assert result["provenance"]["speed_mps"] == 15
    assert result["provenance"]["speed_source"].startswith("https://")
    assert result["energy"]["status"] == "unavailable"
    assert "energy_wh" not in result["energy"]


def test_future_departure_uses_start_and_end_dates_not_sixteen_days():
    departure = datetime.now(UTC) + timedelta(days=5)
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        start = departure.replace(minute=0, second=0, microsecond=0)
        return httpx.Response(200, json=[_hours(start=start.isoformat(), hours=48)])

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        route_weather.assess_route_weather(
            [(121.30, 31.2), (121.31, 31.2)],
            departure.isoformat(),
            assumed_airspeed_mps=12,
            client=client,
        )
    assert seen["start_date"] == departure.date().isoformat()
    assert seen["end_date"] == (departure.date() + timedelta(days=1)).isoformat()
    assert "forecast_days" not in seen
