"""WGS84 coordinates and a documented local equirectangular metre frame.

This is a local planning approximation, not a surveyed ENU datum. The scale is
111320 m/degree and eastings use cos(latitude of the supplied origin). Use for
local routes; ``distance_m`` separately uses the IUGG mean-radius haversine.
Coordinate order is always (longitude, latitude).
"""

from __future__ import annotations

import math

METRES_PER_DEGREE = 111_320.0
MEAN_EARTH_RADIUS_M = 6_371_008.8


def _validate(point: tuple[float, float]) -> tuple[float, float]:
    if len(point) != 2:
        raise ValueError("WGS84 坐标必须为 (经度, 纬度)")
    lon, lat = map(float, point)
    if not math.isfinite(lon) or not math.isfinite(lat) or abs(lon) > 180 or abs(lat) > 85.0511:
        raise ValueError("WGS84 坐标越界或不是有限数值")
    return lon, lat


def wgs84_to_enu(origin: tuple[float, float], point: tuple[float, float]) -> tuple[float, float]:
    lon0, lat0 = _validate(origin)
    lon, lat = _validate(point)
    delta_lon = (lon - lon0 + 180.0) % 360.0 - 180.0
    return (
        delta_lon * math.cos(math.radians(lat0)) * METRES_PER_DEGREE,
        (lat - lat0) * METRES_PER_DEGREE,
    )


def enu_to_wgs84(origin: tuple[float, float], point: tuple[float, float]) -> tuple[float, float]:
    lon0, lat0 = _validate(origin)
    x, y = map(float, point)
    if not math.isfinite(x) or not math.isfinite(y):
        raise ValueError("局部坐标必须为有限数值")
    lon = (lon0 + x / (METRES_PER_DEGREE * math.cos(math.radians(lat0))) + 180.0) % 360.0 - 180.0
    return _validate((lon, lat0 + y / METRES_PER_DEGREE))


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = _validate(a)
    lon2, lat2 = _validate(b)
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlon = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * MEAN_EARTH_RADIUS_M * math.asin(math.sqrt(min(1.0, h)))
