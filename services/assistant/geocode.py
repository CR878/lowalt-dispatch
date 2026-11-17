"""Forward geocoding: Photon first (reachable here), Nominatim as a backup.

Both are OSM-derived, so results carry OSM attribution. Providers are tried in
order and the first non-empty result wins; failures never raise to callers.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from datetime import UTC, datetime

import httpx

from services.assistant import amap

PHOTON = "https://photon.komoot.io/api/"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Lowalt-Aeris-Console/0.2 (https://github.com/Gindama713/lowalt-dispatch)"


def _valid(lng: float, lat: float) -> bool:
    return -180 <= lng <= 180 and -85.0511 <= lat <= 85.0511


def _row(name: str, address: str, lng: float, lat: float) -> dict:
    return {
        "name": name[:200],
        "address": address[:200],
        "point": [lng, lat],
        "source": "osm_search",
        "capturedAt": datetime.now(UTC).isoformat(),
    }


def _photon(query: str, limit: int) -> list[dict]:
    with httpx.Client(timeout=8, follow_redirects=False, trust_env=False) as client:
        response = client.get(
            PHOTON,
            params={"q": query, "limit": limit, "lang": "zh"},
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
        payload = response.json()
    rows = []
    for feature in (payload.get("features") or [])[:limit]:
        properties = feature.get("properties") or {}
        coordinates = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coordinates) != 2:
            continue
        lng, lat = float(coordinates[0]), float(coordinates[1])
        if not _valid(lng, lat):
            continue
        name = str(properties.get("name") or query)
        address = (
            " ".join(
                str(properties.get(key) or "") for key in ("state", "city", "district", "street")
            ).strip()
            or name
        )
        rows.append(_row(name, address, lng, lat))
    return rows


def _nominatim(query: str, limit: int) -> list[dict]:
    with httpx.Client(timeout=8, follow_redirects=False, trust_env=False) as client:
        response = client.get(
            NOMINATIM,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": limit,
                "accept-language": "zh-CN",
            },
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
        payload = response.json()
    rows = []
    for row in (payload if isinstance(payload, list) else [])[:limit]:
        lng, lat = float(row["lon"]), float(row["lat"])
        if not _valid(lng, lat):
            continue
        display = str(row.get("display_name") or "")
        rows.append(_row(display or query, display, lng, lat))
    return rows


def lookup(query: str, limit: int = 5) -> tuple[list[dict], str]:
    """Return (rows, provider). An empty provider means every source failed.

    Amap comes first when a key is configured (Chinese POIs are much better), then
    Photon, then Nominatim. Amap results are already converted to WGS84.
    """
    providers: list[tuple[str, Callable[[str, int], list[dict]]]] = []
    if os.getenv("AMAP_WEB_KEY", "").strip():
        providers.append(("高德地图 / GCJ-02→WGS84", amap.lookup))
    providers += [
        ("OpenStreetMap / Photon", _photon),
        ("OpenStreetMap / Nominatim", _nominatim),
    ]
    for name, provider in providers:
        try:
            rows = provider(query, limit)
        except Exception:
            continue
        if rows:
            return rows, name
    return [], ""
