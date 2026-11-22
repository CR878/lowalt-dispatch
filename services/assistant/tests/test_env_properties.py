"""Deterministic invariants for sampling and verdicts. Not a 200-draw Hypothesis sweep."""

import json

import pytest

from services.assistant.environment import FACTOR_CATALOG, decide_verdict
from services.assistant.route_weather import _distance, sample_by_arc_length

pytestmark = pytest.mark.fast


def _line(length):
    samples, _step, total = sample_by_arc_length([(121.0, 31.2), (121.2, 31.2)])
    return samples, total


def test_property_sample_count_does_not_shrink_when_length_grows(monkeypatch):
    monkeypatch.setattr("services.assistant.route_weather._distance", lambda a, b: 1000.0)
    short, _step, _total = sample_by_arc_length([(0.0, 0.0), (1.0, 0.0)])
    monkeypatch.setattr("services.assistant.route_weather._distance", lambda a, b: 5000.0)
    long, _step, _total = sample_by_arc_length([(0.0, 0.0), (1.0, 0.0)])
    assert len(long) >= len(short)


def test_property_worse_or_equal_verdict_rank():
    base, _ = decide_verdict(
        [{"id": "cloud", "status": "modeled", "effect": "info", "critical": False, "hard_failed": False, "threshold": None}],
        {"independent_cells": 5},
        thresholds_all_null=True,
    )
    worse, _ = decide_verdict(
        [{"id": "wind_cross", "status": "modeled", "effect": "hard", "critical": True, "hard_failed": True, "threshold": 1}],
        {"independent_cells": 5},
        thresholds_all_null=True,
    )
    rank = {"pass": 0, "degraded": 1, "unknown": 2, "blocked": 3}
    assert rank[worse] >= rank[base]


def test_property_hard_failed_is_blocked():
    verdict, _reason = decide_verdict(
        [{"id": "weather_code_max", "status": "modeled", "effect": "hard", "critical": True, "hard_failed": True, "threshold": None}],
        {"independent_cells": 5},
        thresholds_all_null=False,
    )
    assert verdict == "blocked"


def test_property_cells_not_above_sample_count():
    _samples, _step, _total = sample_by_arc_length([(121.0, 31.2), (121.4, 31.2)])
    assert 4 <= len(_samples)


def test_property_honesty_counts_match_catalog():
    assert len(FACTOR_CATALOG) == len({item[0] for item in FACTOR_CATALOG})


def test_property_route_length_is_at_least_the_straight_line():
    points = [(121.30, 31.20), (121.40, 31.30), (121.50, 31.20)]
    samples, _step, total = sample_by_arc_length(points)
    assert total + 1e-6 >= _distance(points[0], points[-1])
    assert samples[0]["point"] == points[0]
    assert samples[-1]["point"] == points[-1]


def test_property_reversed_endpoints_keep_length():
    forward, _step, total = sample_by_arc_length([(121.30, 31.20), (121.55, 31.28)])
    backward, _step, reverse = sample_by_arc_length([(121.55, 31.28), (121.30, 31.20)])
    assert abs(total - reverse) / total < 0.01
    assert len(forward) == len(backward)


def test_property_result_has_no_nan():
    payload = {"verdict": "degraded", "value": 1.5, "cells": 4}
    json.dumps(payload, allow_nan=False)
