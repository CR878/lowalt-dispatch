"""Explicit user-initiated public OSM search, with a shared one-request-per-second limit."""

from __future__ import annotations

import threading
import time
from datetime import UTC, datetime

import httpx
from fastapi import HTTPException

_lock = threading.Lock()
_next_request = 0.0
_cache: dict[str, tuple[float, list[dict]]] = {}


def search_places(query: str) -> dict:
    global _next_request
    query = query.strip()
    if not 2 <= len(query) <= 180:
        raise HTTPException(422, "Provide a city/place query of 2-180 characters")
    with _lock:
        now = time.monotonic()
        cached = _cache.get(query)
        if cached and now - cached[0] < 600:
            return {"places": cached[1], "source": "OpenStreetMap / Nominatim", "crs": "EPSG:4326"}
        if now < _next_request:
            raise HTTPException(429, "Search rate limit: one request per second")
        _next_request = now + 1.05
    try:
        with httpx.Client(timeout=8, follow_redirects=False, trust_env=False) as client:
            response = client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "jsonv2", "limit": 5, "accept-language": "zh-CN"},
                headers={
                    "User-Agent": "Lowalt-Aeris-Console/0.2 (https://github.com/Gindama713/lowalt-dispatch)"
                },
            )
            response.raise_for_status()
            if len(response.content) > 200_000:
                raise ValueError("Response too large")
            raw = response.json()
            if not isinstance(raw, list):
                raise ValueError("Unexpected search response")
        places = []
        for row in raw[:5]:
            lng, lat = float(row["lon"]), float(row["lat"])
            if not (-180 <= lng <= 180 and -85.0511 <= lat <= 85.0511):
                continue
            places.append(
                {
                    "name": str(row["display_name"])[:200],
                    "point": [lng, lat],
                    "source": "osm_search",
                    "capturedAt": datetime.now(UTC).isoformat(),
                }
            )
    except Exception:
        raise HTTPException(
            503, "Place search is unavailable; use coordinates or select on the map"
        ) from None
    with _lock:
        if len(_cache) >= 100:
            _cache.pop(next(iter(_cache)))
        _cache[query] = (time.monotonic(), places)
    return {"places": places, "source": "OpenStreetMap / Nominatim", "crs": "EPSG:4326"}
