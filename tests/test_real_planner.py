"""Real geographic planning contracts, using explicitly synthetic test geometry."""

from __future__ import annotations

import math

import pytest
from shapely.geometry import LineString, Polygon

from core.geometry import geographic_grid_clearance_m
from planner.georef import distance_m, enu_to_wgs84, wgs84_to_enu
from planner.real import plan_real_route

ANCHOR = (121.4, 31.2)


def geo(x, y):
    return enu_to_wgs84(ANCHOR, (x, y))


def collection(polygons, *, length=30000):
    southwest, northeast = geo(-1500, -1500), geo(length + 1500, 1500)
    return {
        "type": "FeatureCollection",
        "bbox": [*southwest, *northeast],
        "features": [
            {
                "type": "Feature",
                "properties": {"status": "test_fixture"},
                "geometry": {"type": "Polygon", "coordinates": [[list(geo(x, y)) for x, y in ring]]},
            }
            for ring in polygons
        ],
    }


def test_georef_roundtrip_and_actual_airport_distance():
    hongqiao, pudong = (121.335209, 31.197950), (121.804400, 31.144383)
    # The handoff's 30.2 km is numerically incorrect for the supplied points.
    actual = distance_m(hongqiao, pudong)
    assert 44_900 < actual < 45_100
    projected = wgs84_to_enu(hongqiao, pudong)
    assert math.hypot(*projected) == pytest.approx(actual, rel=0.003)
    assert distance_m(pudong, enu_to_wgs84(hongqiao, projected)) < 0.001


@pytest.mark.parametrize("point", [(181, 20), (120, 90), (float("nan"), 20), (120, float("inf"))])
def test_georef_rejects_invalid_coordinates(point):
    with pytest.raises(ValueError):
        wgs84_to_enu(ANCHOR, point)


@pytest.mark.parametrize("length", [30_000, 45_000])
def test_long_route_avoids_subcell_building_with_continuous_clearance(length):
    centre = length / 2
    obstacle = [
        (centre - 0.5, -0.5),
        (centre + 0.5, -0.5),
        (centre + 0.5, 0.5),
        (centre - 0.5, 0.5),
        (centre - 0.5, -0.5),
    ]
    result = plan_real_route(
        geo(0, 0),
        geo(length, 0),
        collection([obstacle], length=length),
        resolution_m=20,
    )
    assert result["found"], result
    assert len(result["waypoints"]) > 2
    assert result["elapsed_ms"] < 30_000
    assert result["clearance_m"] == 20
    assert result["grid_clearance_m"] == pytest.approx(20 + 20 / math.sqrt(2))
    assert result["continuous_clearance_verified"]
    assert distance_m(result["waypoints"][0], geo(0, 0)) < 0.001
    assert distance_m(result["waypoints"][-1], geo(length, 0)) < 0.001
    route = LineString([wgs84_to_enu(ANCHOR, p) for p in result["waypoints"]])
    assert route.distance(Polygon(obstacle)) >= 19.99


def test_blocked_real_endpoint_is_never_snapped():
    obstacle = [(-50, -50), (50, -50), (50, 50), (-50, 50), (-50, -50)]
    result = plan_real_route(geo(0, 0), geo(30000, 0), collection([obstacle]))
    assert not result["found"]
    assert not result["waypoints"]
    assert "未移动端点" in result["reason"]


def test_coarse_mask_connector_preserves_physical_endpoint_and_clearance():
    obstacle = [(-50, -50), (50, -50), (50, 50), (-50, 50), (-50, -50)]
    start, goal = geo(75, 0), geo(30000, 0)
    result = plan_real_route(start, goal, collection([obstacle]), resolution_m=20)
    assert result["found"], result
    assert result["waypoints"][0] == start
    assert result["waypoints"][-1] == goal
    assert result["endpoint_connector_lengths_m"][0] > 0
    line = LineString([wgs84_to_enu(ANCHOR, p) for p in result["waypoints"]])
    assert line.distance(Polygon(obstacle)) >= 20


def test_real_path_cannot_escape_fetched_coverage():
    # Wall joins both known-coverage boundaries: a route outside the downloaded
    # bbox would look free but is unobserved and must never be returned.
    obstacle = [(14000, -1600), (16000, -1600), (16000, 1600), (14000, 1600), (14000, -1600)]
    result = plan_real_route(geo(0, 0), geo(30000, 0), collection([obstacle]), resolution_m=20)
    assert not result["found"]
    assert not result["waypoints"]


def test_footprint_with_hole_retains_real_courtyard_geometry():
    outer = [(-1000, -1000), (1000, -1000), (1000, 1000), (-1000, 1000), (-1000, -1000)]
    hole = [(-500, -500), (500, -500), (500, 500), (-500, 500), (-500, -500)]
    fc = collection([], length=3000)
    fc["features"] = [
        {
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [[[list(geo(x, y)) for x, y in ring] for ring in (outer, hole)]],
            }
        }
    ]
    result = plan_real_route(geo(-300, 0), geo(300, 0), fc)
    assert result["found"], result


def test_real_coverage_and_malformed_geometry_fail_explicitly():
    with pytest.raises(ValueError, match="bbox"):
        plan_real_route(geo(0, 0), geo(30000, 0), {"type": "FeatureCollection", "features": []})
    fc = collection([], length=30000)
    fc["features"] = [{"geometry": {"type": "Polygon", "coordinates": [[geo(0, 0), geo(50, 0), geo(0, 50)]]}}]
    with pytest.raises(ValueError, match="未闭合"):
        plan_real_route(geo(0, 0), geo(30000, 0), fc)


def test_discretization_allowance_scales_with_resolution():
    assert geographic_grid_clearance_m(10, 20) == pytest.approx(20 + 10 / math.sqrt(2))
    assert geographic_grid_clearance_m(30, 20) > geographic_grid_clearance_m(20, 20)
