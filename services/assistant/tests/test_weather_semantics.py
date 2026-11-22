"""P0 weather semantics. Fixtures are explicit test data, never live evidence."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest

from services.assistant import evidence, route_weather
from services.assistant.tests.test_route_weather import as_batch, calibrated_test_profile


def _series(start="2026-11-18T12:00:00+00:00", hours=4):
    instant = datetime.fromisoformat(start)
    hourly = {field: [0.0] * hours for field in evidence.HOURLY_FIELDS}
    hourly["time"] = [
        (instant + timedelta(hours=i)).replace(tzinfo=None).isoformat(timespec="minutes")
        for i in range(hours)
    ]
    hourly.update(
        {
            "temperature_2m": [20.0] * hours,
            "relative_humidity_2m": [50.0] * hours,
            "surface_pressure": [1013.25] * hours,
            "wind_speed_10m": [0.0] * hours,
            "wind_direction_10m": [0.0] * hours,
            "wind_gusts_10m": [4.0] * hours,
            "precipitation": [0.0] * hours,
            "weather_code": [0] * hours,
        }
    )
    return {"hourly": hourly, "utc_offset_seconds": 0, "latitude": 31.2, "longitude": 121.4}


def _at(hour, minute=0):
    return datetime(2026, 11, 18, hour, minute, tzinfo=UTC)


def test_hourly_fields_come_from_the_semantics_table():
    assert evidence.HOURLY_FIELDS == tuple(evidence.FIELD_SEMANTICS)
    assert set(evidence.FIELD_SEMANTICS.values()) <= {
        "instant",
        "hourly_accumulation",
        "hourly_probability",
        "hourly_max",
        "code",
    }
    for name in (
        "cloud_cover",
        "cloud_cover_low",
        "cloud_cover_mid",
        "cloud_cover_high",
        "wind_speed_80m",
        "wind_direction_80m",
        "wind_speed_120m",
        "wind_direction_120m",
        "wind_speed_180m",
        "wind_direction_180m",
        "precipitation_probability",
        "dew_point_2m",
        "cape",
        "freezing_level_height",
        "temperature_80m",
        "temperature_120m",
        "temperature_180m",
    ):
        assert name in evidence.FIELD_SEMANTICS


def test_t15_interval_quantities_are_not_split_across_the_hour():
    payload = _series(hours=2)
    payload["hourly"]["precipitation"] = [0.0, 8.0]
    payload["hourly"]["wind_gusts_10m"] = [4.0, 12.0]
    payload["hourly"]["precipitation_probability"] = [10.0, 90.0]
    payload["hourly"]["weather_code"] = [3, 65]
    payload["hourly"]["temperature_2m"] = [10.0, 20.0]
    payload["hourly"]["wind_speed_10m"] = [4.0, 4.0]
    payload["hourly"]["wind_direction_10m"] = [350.0, 10.0]
    payload["hourly"]["wind_speed_80m"] = [4.0, 4.0]
    payload["hourly"]["wind_direction_80m"] = [350.0, 10.0]
    forecast = {"hourly": payload["hourly"], "utc_offset_seconds": 0}

    mid = evidence.values_at(forecast, _at(12, 30))
    assert mid["precipitation"] == 8.0
    assert mid["precipitation"] != 4.0
    assert mid["wind_gusts_10m"] == 12.0
    assert mid["wind_gusts_10m"] != 8.0
    assert mid["precipitation_probability"] == 90.0
    assert mid["weather_code"] == 3
    assert mid["temperature_2m"] == 15.0
    assert min(mid["wind_direction_80m"], abs(mid["wind_direction_80m"] - 360)) < 1e-8
    assert mid["wind_direction_10m"] == pytest.approx(mid["wind_direction_80m"])
    assert mid["wind_speed_80m"] == pytest.approx(4 * __import__("math").cos(__import__("math").radians(10)))

    on_hour = evidence.values_at(forecast, _at(12))
    assert on_hour["precipitation"] == 0.0
    assert on_hour["wind_gusts_10m"] == 4.0
    assert on_hour["weather_code"] == 3
    assert evidence.values_at(forecast, _at(13))["weather_code"] == 65

    missing = _series(hours=2)
    missing["hourly"]["precipitation"] = [0.0, None]
    missing["hourly"]["wind_speed_80m"] = [None, None]
    unresolved = evidence.interpolate_forecast(
        {"hourly": missing["hourly"], "utc_offset_seconds": 0}, _at(12, 30)
    )
    assert unresolved["precipitation"] is None
    assert unresolved["wind_speed_80m"] is None
    assert unresolved["wind_speed_10m"] == 0.0


def test_omitted_field_stays_null_and_is_not_replaced(monkeypatch):
    payload = _series()
    del payload["hourly"]["wind_speed_80m"]
    del payload["hourly"]["temperature_80m"]

    def handler(request):
        assert "wind_speed_80m" in request.url.params["hourly"]
        assert request.url.params["forecast_days"] == "16"
        return httpx.Response(200, json=payload)

    monkeypatch.setattr(evidence, "_WEATHER_CACHE", {})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        public = evidence.fetch_weather_forecast(31.2, 121.4, "2026-11-18T12:30:00Z", client=client)
        detailed = evidence.fetch_weather_forecast(
            31.2, 121.4, "2026-11-18T12:30:00Z", client=client, include_hourly=True
        )
    assert public["status"] == "ok"
    assert public["values"]["wind_speed_80m"] is None
    assert public["values"]["wind_speed_10m"] == 0.0
    assert "model_point" not in public
    assert "wind_speed_80m" in public["note"] and "邻近" in public["note"]
    assert detailed["values"]["temperature_80m"] is None
    assert detailed["values"]["wind_speed_10m"] == 0.0
    assert "邻近" in detailed["omitted_fields"]["wind_speed_80m"]
    assert detailed["model_point"] == [121.4, 31.2]


def test_batch_uses_two_forecast_days_and_rejects_a_length_mismatch():
    calls = []

    def handler(request):
        calls.append(request.url.params["forecast_days"])
        latitudes = request.url.params["latitude"].split(",")
        assert len(latitudes) <= evidence.BATCH_POINT_LIMIT
        rows = []
        for longitude in request.url.params["longitude"].split(","):
            row = _series()
            row["longitude"] = float(longitude)
            row["hourly"]["precipitation"] = [1.0]
            rows.append(row)
        return httpx.Response(200, json=rows)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        failed = evidence.fetch_weather_batch(
            [31.2, 31.3],
            [121.4, 121.5],
            "2026-11-18T12:30:00Z",
            client=client,
        )
    assert calls == ["2"]
    assert len(failed) == 2
    assert all(item["status"] == "unavailable" and item["values"] == {} for item in failed)

    def short_count(request):
        return httpx.Response(200, json=[_series()])

    with httpx.Client(transport=httpx.MockTransport(short_count)) as client:
        mismatched = evidence.fetch_weather_batch(
            [31.2, 31.3], [121.4, 121.5], "2026-11-18T12:30:00Z", client=client
        )
    assert all(item["status"] == "unavailable" for item in mismatched)


def test_batch_sends_at_most_20_points_per_request():
    sizes = []

    def handler(request):
        latitudes = request.url.params["latitude"].split(",")
        sizes.append(len(latitudes))
        rows = []
        for latitude, longitude in zip(latitudes, request.url.params["longitude"].split(","), strict=True):
            row = _series()
            row["latitude"] = float(latitude)
            row["longitude"] = float(longitude)
            rows.append(row)
        return httpx.Response(200, json=rows)

    latitudes = [31.0 + index * 0.01 for index in range(21)]
    longitudes = [121.0] * 21
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        results = evidence.fetch_weather_batch(latitudes, longitudes, "2026-11-18T12:30:00Z", client=client)
    assert sizes == [20, 1]
    assert len(results) == 21
    assert all(item["status"] == "ok" for item in results)


def test_cache_key_includes_forecast_days(monkeypatch):
    evidence._WEATHER_CACHE.clear()
    calls = []

    class Dummy:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, params=None):
            calls.append(params["forecast_days"])
            return httpx.Response(200, json=_series())

    monkeypatch.setattr(evidence.httpx, "Client", Dummy)
    evidence.fetch_weather_forecast(31.2, 121.4, "2026-11-18T12:30:00Z", forecast_days=2)
    evidence.fetch_weather_forecast(31.2, 121.4, "2026-11-18T12:30:00Z", forecast_days=2)
    evidence.fetch_weather_forecast(31.2, 121.4, "2026-11-18T12:30:00Z", forecast_days=16)
    assert calls == [2, 16]
    assert {key[4] for key in evidence._WEATHER_CACHE} == {2, 16}


def test_t14_mid_leg_peak_enters_the_safety_envelope_not_the_endpoint_mean(monkeypatch):
    payload = _series(hours=4)
    payload["hourly"]["wind_gusts_10m"] = [4.0, 12.0, 4.0, 4.0]
    payload["hourly"]["precipitation"] = [0.0, 8.0, 0.0, 0.0]
    payload["hourly"]["wind_speed_10m"] = [0.0, 0.0, 0.0, 0.0]
    forecast = {"hourly": payload["hourly"], "utc_offset_seconds": 0}
    departure = evidence.values_at(forecast, _at(12))
    arrival = evidence.values_at(forecast, _at(14))
    assert departure["wind_gusts_10m"] == 4.0
    assert arrival["wind_gusts_10m"] == 4.0
    assert (departure["wind_gusts_10m"] + arrival["wind_gusts_10m"]) / 2 == 4.0

    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 86400.0)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))

    def handler(request):
        assert request.url.params["forecast_days"] == "2"
        count = len(request.url.params["latitude"].split(","))
        return httpx.Response(200, json=[payload for _ in range(count)])

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = route_weather.assess_route_weather(
            [(121.0, 31.2), (121.8, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    envelope = result["energy"]["legs"][0]["safety_envelope"]
    assert envelope["gust_max"] == 12.0
    assert envelope["precip_max"] == 8.0
    assert result["safety_envelope"]["gust_max"] == 12.0
    assert result["safety_envelope"]["precip_max"] == 8.0
    assert result["energy"]["legs"][0]["wind_speed_mps"] == 0.0
    assert result["constraints_evaluated"] == "wind_triangle_only"
    assert result["dispatch_enabled"] is False


def test_t16_independent_cells_follow_returned_model_points():
    cells = [(121.0, 31.0), (121.1, 31.0), (121.2, 31.0), (121.3, 31.0)]
    samples = [{"model_point": list(cells[index % 4])} for index in range(24)]
    assert evidence.count_independent_cells(samples) == 4
    assert evidence.count_independent_cells([{"model_point": None}, {}]) == 0

    def handler(request):
        longitudes = [float(item) for item in request.url.params["longitude"].split(",")]
        shared = [121.25, 31.25]
        distinct = [121.55, 31.25]
        rows = []
        for index, longitude in enumerate(longitudes):
            row = _series()
            cell = shared if index < 2 else distinct
            row["longitude"], row["latitude"] = cell
            row["hourly"]["wind_speed_10m"] = [4.0] * 4
            rows.append(row)
            assert longitude
        return httpx.Response(200, json=rows)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = route_weather.assess_route_weather(
            [(121.2, 31.2), (121.6, 31.2)],
            "2026-11-18T12:00:00+00:00",
            client=client,
        )
    assert len(result["samples"]) == result["coverage"]["sample_count"]
    assert result["coverage"]["sample_count"] >= 8
    assert result["coverage"]["independent_cells"] == 2
    assert result["coverage"]["independent_cells"] != 24
    assert result["coverage"]["model_grid_resolution_km"] is None
    assert result["dispatch_enabled"] is False


def test_t13_duration_truncation_does_not_change_energy(monkeypatch):
    monkeypatch.setattr(route_weather, "_distance", lambda a, b: 1000.0)
    monkeypatch.setattr(route_weather, "_load_real_profile", lambda key: (calibrated_test_profile(), ""))
    with httpx.Client(transport=httpx.MockTransport(as_batch(_series()))) as client:
        result = route_weather.assess_route_weather(
            [(121.3, 31.2), (121.31, 31.2)],
            "2026-11-18T12:00:00+00:00",
            vehicle_key="test-only",
            client=client,
        )
    assert result["energy"]["duration_s"] == pytest.approx(83.3)
    assert result["energy"]["duration_s"] != pytest.approx(1000 / 12)
    assert result["energy"]["energy_wh"] == pytest.approx(50.0)
    assert "0.1 s" in result["energy"]["precision_note"]
    assert "20 m" in result["energy"]["precision_note"]


def test_t13_navigation_truncates_clearance_and_length(monkeypatch):
    import inspect

    from planner.real import plan_real_route
    from services.assistant import osm_obstacles
    from services.assistant.navigation import CandidateInput, candidate_routes

    assert inspect.signature(plan_real_route).parameters["physical_clearance_m"].default == 20.0

    def fake_plan(origin, destination, obstacles, **kwargs):
        return {
            "found": True,
            "waypoints": [origin, destination],
            "length_m": 1000.123456789,
            "clearance_m": 20.0000000004,
            "resolution_m": kwargs["resolution_m"],
            "nodes_expanded": 3,
            "elapsed_ms": 1.25,
            "continuous_clearance_verified": True,
            "grid_clearance_m": 20.0 + kwargs["resolution_m"] / 2**0.5,
            "reason": None,
            "warnings": [],
        }

    monkeypatch.setattr("planner.real.plan_real_route", fake_plan)
    monkeypatch.setattr(
        osm_obstacles,
        "fetch_obstacles",
        lambda *args, **kwargs: {
            "obstacles": {"type": "FeatureCollection", "features": []},
            "roads": {"type": "FeatureCollection", "features": []},
            "metadata": {"scene_id": "a" * 16, "source": "test fixture", "fetched_at": "test"},
            "warnings": [],
        },
    )
    monkeypatch.setattr(
        route_weather,
        "assess_route_weather",
        lambda *args, **kwargs: {
            "status": "unavailable",
            "source": "test",
            "warnings": [],
            "energy": {"status": "unavailable"},
            "flight_feasibility": {"status": "unavailable"},
        },
    )
    result = candidate_routes(
        CandidateInput.model_validate(
            {
                "frame": "WGS84",
                "origin": {"lng": 121.46, "lat": 31.22},
                "destination": {"lng": 121.48, "lat": 31.22},
            }
        )
    )
    assert result["clearance_m"] == 20.0
    assert result["route"]["length_m"] == pytest.approx(1000.1)
    assert result["vehicle_assessment"]["distance_m"] == result["route"]["length_m"]
    assert result["grid_clearance_m"] == pytest.approx(20.0 + 10 / 2**0.5)
    assert "20 m" in result["precision_note"]
    assert result["dispatch_enabled"] is False
    assert result["operationally_approved"] is False
