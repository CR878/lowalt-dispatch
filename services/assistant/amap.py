"""Amap (高德) geocoding. Amap returns GCJ-02, so callers always get WGS84.

The key is read from AMAP_WEB_KEY only; never hard-code it in the repository.
"""

from __future__ import annotations

import math
import os
from datetime import UTC, datetime

import httpx

GEO = "https://restapi.amap.com/v3/geocode/geo"
PLACE_TEXT = "https://restapi.amap.com/v3/place/text"

_A = 6378245.0
_EE = 0.00669342162296594323


def _out_of_china(lng: float, lat: float) -> bool:
    return not (72.004 <= lng <= 137.8347 and 0.8293 <= lat <= 55.8271)


def _transform_lat(x: float, y: float) -> float:
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
    ret += 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lng(x: float, y: float) -> float:
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
    ret += 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


def gcj02_to_wgs84(lng: float, lat: float) -> tuple[float, float]:
    """Standard inverse of the GCJ-02 obfuscation; identity outside China."""
    if _out_of_china(lng, lat):
        return lng, lat
    dlat = _transform_lat(lng - 105.0, lat - 35.0)
    dlng = _transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * math.pi
    magic = math.sin(radlat)
    magic = 1 - _EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180.0) / (_A / sqrtmagic * math.cos(radlat) * math.pi)
    return round(lng - dlng, 7), round(lat - dlat, 7)


def _key() -> str:
    return os.getenv("AMAP_WEB_KEY", "").strip()


def _row(name: str, address: str, location: str) -> dict | None:
    parts = str(location).split(",")
    if len(parts) != 2:
        return None
    try:
        lng, lat = float(parts[0]), float(parts[1])
    except ValueError:
        return None
    if not (-180 <= lng <= 180 and -85.0511 <= lat <= 85.0511):
        return None
    wgs_lng, wgs_lat = gcj02_to_wgs84(lng, lat)
    return {
        "name": name[:200],
        "address": (address or name)[:200],
        "point": [wgs_lng, wgs_lat],
        "source": "osm_search",
        "capturedAt": datetime.now(UTC).isoformat(),
        "provider": "amap",
    }


def lookup(query: str, limit: int = 5) -> list[dict]:
    key = _key()
    if not key:
        return []
    rows: list[dict] = []
    seen: set[tuple[float, float]] = set()
    with httpx.Client(timeout=8, follow_redirects=False, trust_env=False) as client:
        # POI search first: geocode/geo treats "上海虹桥" as an address and can return
        # 虹桥镇 (7 km east of the airport); inputtips returns hotels, not the airport.
        response = client.get(
            PLACE_TEXT,
            params={
                "keywords": query,
                "offset": max(limit, 5),
                "page": 1,
                "extensions": "base",
                "key": key,
            },
        )
        response.raise_for_status()
        payload = response.json()
        tips: list[tuple[str, dict]] = []
        for item in payload.get("pois") or []:
            name = str(item.get("name") or query)
            address = " ".join(str(item.get(part) or "") for part in ("adname", "address")).strip()
            row = _row(name, address or name, item.get("location"))
            if row:
                tips.append((str(item.get("typecode") or ""), row))

        # Rank by how much of the query the POI name covers, then prefer Amap's
        # airport class (1501xx): "上海虹桥" must beat 虹桥火车站, and "浦东机场"
        # must beat 机场镇. Generic suffixes are stripped so the core name must match.
        core = query
        for word in ("国际机场", "机场", "火车站", "车站", "站"):
            core = core.replace(word, "")

        explicit = any(word in query for word in ("火车站", "车站", "地铁", "公交"))
        wanted = "" if explicit else "1501"

        def rank(pair: tuple[str, dict]) -> tuple[int, int, int]:
            typecode, row = pair
            name = row["name"]
            type_hit = 1 if wanted and typecode.startswith(wanted) else 0
            core_hit = 1 if core and core in name else 0
            overlap = sum(1 for i in range(len(query) - 1) if query[i : i + 2] in name)
            return (-type_hit, -core_hit, -overlap)

        tips.sort(key=rank)
        for _, row in tips:
            if len(rows) >= limit:
                break
            if tuple(row["point"]) not in seen:
                seen.add(tuple(row["point"]))
                rows.append(row)
        if len(rows) < limit:
            response = client.get(GEO, params={"address": query, "key": key})
            response.raise_for_status()
            payload = response.json()
            if payload.get("status") == "1":
                for item in (payload.get("geocodes") or [])[:limit]:
                    address = str(item.get("formatted_address") or "")
                    row = _row(address or query, address, item.get("location"))
                    if row and tuple(row["point"]) not in seen:
                        seen.add(tuple(row["point"]))
                        rows.append(row)
    return rows
