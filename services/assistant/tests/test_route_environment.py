"""Environment verdict fixtures. These are not live forecasts."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from services.assistant.environment import (
    FACTOR_CATALOG,
    EnvQuery,
    assess_route_environment,
    clear_environment_cache,
    decide_verdict,
    explain_verdict,
    thresholds_all_null,
)
from services.assistant.honesty import verify_response_honesty
from services.assistant.tools import Toolset

pytestmark = pytest.mark.fast


def _sample(index, precip=0.0, code=0, wind=4.0, status="ok"):
    return {
        "index": index,
        "status": status,
        "s_m": index * 1000,
        "eta": "2026-11-22T08:00:00+00:00",
        "values": {
            "precipitation": precip,
            "precipitation_probability": 0,
            "visibility": 10000,
            "wind_gusts_10m": 4,
            "wind_speed_10m": wind,
            "wind_direction_10m": 0,
            "wind_speed_120m": wind,
            "wind_direction_120m": 0,
            "cloud_cover": 10,
            "weather_code": code,
            "temperature_2m": 20,
            "relative_humidity_2m": 50,
            "surface_pressure": 1013,
            "dew_point_2m": 10,
            "cape": 100,
            "freezing_level_height": 3000,
        },
        "model_point": [121.2 + (index % 4) * 0.05, 31.2],
        "fetched_at": "2026-11-22T00:00:00+00:00",
    }


def _weather(precips, codes=None, cells=4, cross=2.0, speed=12.0, statuses=None):
    samples = []
    for index, precip in enumerate(precips):
        sample = _sample(index, precip, (codes or [0] * len(precips))[index])
        if statuses:
            sample["status"] = statuses[index]
            if statuses[index] != "ok":
                sample["values"] = {}
                sample["model_point"] = None
        samples.append(sample)
    return {
        "samples": samples,
        "coverage": {
            "sample_count": len(samples),
            "independent_cells": cells,
            "statement": "fixture",
            "model_grid_resolution_km": None,
        },
        "safety_envelope": {
            "precip_max": max(precips),
            "visibility_min": 10000,
            "gust_max": 4,
            "crosswind_max": cross,
            "wind_speed_10m_max": 4,
        },
        "provenance": {
            "speed_mps": speed,
            "speed_source": "fixture-calibrated",
            "time_basis": "calibrated_airspeed",
            "model": None,
            "model_grid_resolution_km": None,
            "weather_request_stats": [],
        },
        "energy": {"status": "unavailable", "reason": "fixture has no Wh/m"},
        "dispatch_enabled": False,
    }


def _query(**kwargs):
    base = {
        "origin": (121.30, 31.20),
        "destination": (121.36, 31.20),
        "scheduled_for": "2026-11-22T08:00:00+00:00",
    }
    base.update(kwargs)
    return EnvQuery(**base)


def test_catalog_matches_declared_length_and_thresholds_are_null():
    assert len(FACTOR_CATALOG) >= 1
    assert thresholds_all_null()
    result = assess_route_environment(_query(), weather=_weather([0, 0, 0, 0, 0]))
    assert result["honesty"]["checked"] == len(result["factors"]) == len(FACTOR_CATALOG)
    assert result["verdict"] != "pass"
    assert result["verdict"] == "degraded"
    assert result["dispatch_enabled"] is False
    assert result["operationally_approved"] is False


def test_t36_mid_route_rain_is_not_pass():
    result = assess_route_environment(_query(), weather=_weather([0, 0, 8, 0, 0]))
    assert result["verdict"] in {"blocked", "degraded"}
    assert result["constraints"]["mid_route_precipitation"] is True
    assert result["verdict"] != "pass"


def test_thunderstorm_code_blocks_without_inventing_a_precip_threshold():
    result = assess_route_environment(_query(), weather=_weather([0, 0, 0], codes=[0, 95, 0]))
    assert result["verdict"] == "blocked"
    assert "weather_code_max" in result["constraints"]["hard_failed"]


def test_all_weather_unavailable_is_unknown():
    weather = _weather([0, 0, 0], statuses=["unavailable", "unavailable", "unavailable"], cells=None)
    result = assess_route_environment(_query(), weather=weather)
    assert result["status"] == "unavailable"
    assert result["verdict"] == "unknown"
    assert result["gaps"]
    assert result["samples"][0]["values"] == {}


def test_one_independent_cell_is_not_pass():
    result = assess_route_environment(_query(), weather=_weather([0, 0, 0, 0], cells=1))
    assert result["verdict"] in {"degraded", "unknown"}
    assert result["verdict"] != "pass"
    assert result["coverage"]["independent_cells"] == 1


def test_crosswind_equal_to_sourced_airspeed_is_blocked():
    result = assess_route_environment(_query(), weather=_weather([0, 0, 0, 0], cross=15, speed=15))
    assert result["verdict"] == "blocked"
    assert "wind_cross" in result["constraints"]["hard_failed"]


def test_crosswind_without_airspeed_is_not_invented():
    weather = _weather([0, 0, 0, 0], cross=9, speed=None)
    weather["provenance"]["speed_mps"] = None
    weather["provenance"]["time_basis"] = None
    result = assess_route_environment(_query(), weather=weather)
    cross = next(factor for factor in result["factors"] if factor["id"] == "wind_cross")
    assert cross["status"] == "unavailable"
    assert cross["hard_failed"] is False
    assert result["verdict"] != "blocked"


def test_explain_verdict_does_not_recompute():
    clear_environment_cache()
    first = assess_route_environment(_query(), weather=_weather([0, 8, 0, 0]))
    explained = explain_verdict(first["evidence_id"])
    assert explained["verdict"] == first["verdict"]
    assert explained["evidence_id"] == first["evidence_id"]
    assert "precipitation_max" in {item["id"] for item in explained["drivers"]} or explained["not_the_reason"]


def test_cache_changes_when_time_or_payload_changes():
    clear_environment_cache()
    weather = _weather([0, 0, 0, 0])
    first = assess_route_environment(_query(), weather=weather)
    second = assess_route_environment(_query(scheduled_for="2026-11-22T09:00:00+00:00"), weather=weather)
    third = assess_route_environment(_query(payload_kg=2), weather=weather)
    assert first["evidence_id"] != second["evidence_id"]
    assert first["evidence_id"] != third["evidence_id"]
    assert first["factors"] == assess_route_environment(_query(), weather=weather)["factors"]


def test_same_input_is_idempotent():
    clear_environment_cache()
    weather = _weather([0, 0, 0, 0])
    first = assess_route_environment(_query(), weather=weather)
    second = assess_route_environment(_query(), weather=weather)
    assert first["verdict"] == second["verdict"]
    assert [factor["id"] for factor in first["factors"]] == [item[0] for item in FACTOR_CATALOG]
    assert first["factors"] == second["factors"]


def test_landing_sites_unavailable_does_not_block():
    from services.assistant.tools import LandingQuery

    result = Toolset.check_landing_sites(None, LandingQuery(origin=(121.3, 31.2), destination=(121.4, 31.2)))
    assert result["status"] == "unavailable"
    assert result["verdict"] is None
    assert result["dispatch_enabled"] is False


def test_honesty_catches_forbidden_phrase_and_unsourced_number():
    results = {
        "assess_route_environment": {
            "verdict": "degraded",
            "gaps": [{"factor": "cloud_base_height"}],
            "factors": [],
        }
    }
    assert verify_response_honesty("已充分考虑，可以飞", results, asked_flight_feasibility=True)
    assert any(
        item.startswith("unsourced_number")
        for item in verify_response_honesty("风速 12 m/s", results, asked_flight_feasibility=False)
    )
    assert (
        verify_response_honesty(
            "环境判定为 degraded，另有 1 项未判定。", results, asked_flight_feasibility=False
        )
        == []
    )


def test_query_rejects_nan_far_and_dateline():
    with pytest.raises(ValidationError):
        EnvQuery(origin=(121.0, 31.0), destination=(121.1, float("nan")))
    with pytest.raises(ValidationError):
        EnvQuery(origin=(121.0, 31.0), destination=(122.5, 31.0))
    with pytest.raises(ValidationError):
        EnvQuery(origin=(10.0, 0.0), destination=(-170.0, 0.0))


def test_pass_is_unreachable_without_a_sourced_threshold():
    factors = [
        {
            "id": "precipitation_max",
            "status": "modeled",
            "effect": "info",
            "critical": False,
            "hard_failed": False,
            "threshold": None,
        }
    ]
    verdict, _reason = decide_verdict(
        factors, {"independent_cells": 5}, thresholds_all_null=True, weather_unavailable=False
    )
    assert verdict == "degraded"
    allowed, _reason = decide_verdict(
        factors, {"independent_cells": 5}, thresholds_all_null=False, weather_unavailable=False
    )
    assert allowed == "pass"


@pytest.mark.parametrize(
    ("label", "kwargs", "expect"),
    [
        ("hard", {"hard": True}, "blocked"),
        ("down", {"down": True}, "unknown"),
        ("one_cell", {"cells": 1}, "degraded"),
        ("null_cells", {"cells": None}, "unknown"),
        ("null_threshold", {"cells": 5}, "degraded"),
        ("sourced_threshold", {"cells": 5, "nulls": False}, "pass"),
        ("critical_gap", {"cells": 4, "critical": True}, "degraded"),
        ("unavailable_factor", {"cells": 4, "unavailable": True}, "degraded"),
    ],
)
def test_verdict_matrix_rows(label, kwargs, expect):
    factors = []
    if kwargs.get("hard"):
        factors.append(
            {
                "id": "wind_cross",
                "status": "modeled",
                "effect": "hard",
                "critical": True,
                "hard_failed": True,
                "threshold": 1,
            }
        )
    if kwargs.get("critical"):
        factors.append(
            {
                "id": "visibility_min",
                "status": "not_evaluated",
                "effect": "hard",
                "critical": True,
                "hard_failed": False,
                "threshold": None,
            }
        )
    if kwargs.get("unavailable"):
        factors.append(
            {
                "id": "energy_wh",
                "status": "unavailable",
                "effect": "info",
                "critical": False,
                "hard_failed": False,
                "threshold": None,
            }
        )
    if not factors:
        factors.append(
            {
                "id": "cloud_cover_max",
                "status": "modeled",
                "effect": "info",
                "critical": False,
                "hard_failed": False,
                "threshold": 1,
            }
        )
    verdict, _reason = decide_verdict(
        factors,
        {"independent_cells": kwargs.get("cells", 4)},
        thresholds_all_null=kwargs.get("nulls", True),
        weather_unavailable=kwargs.get("down", False),
    )
    assert verdict == expect, label


@pytest.mark.live
def test_live_probe_is_skipped_without_the_explicit_flag():
    if __import__("os").environ.get("AERIS_REAL_DATA_CHECK") != "1":
        pytest.skip("live_required")
    observed = datetime.now(UTC)
    assert observed.year >= 2026
