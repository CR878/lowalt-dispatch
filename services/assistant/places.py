"""Explicit user-initiated public OSM search, with a shared one-request-per-second limit."""

from __future__ import annotations

import threading
import time

from fastapi import HTTPException

from services.assistant.geocode import lookup

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
            return {"places": cached[1], "source": "cache", "crs": "EPSG:4326"}
        if now < _next_request:
            raise HTTPException(429, "Search rate limit: one request per second")
        _next_request = now + 1.05
    rows, provider = lookup(query, 5)
    if not rows:
        return {
            "places": [],
            "source": provider or "OpenStreetMap",
            "crs": "EPSG:4326",
            "unavailable": True,
            "note": "地点搜索服务不可达或没有匹配；可手动输入经纬度或在地图上点选",
        }
    with _lock:
        if len(_cache) >= 100:
            _cache.pop(next(iter(_cache)))
        _cache[query] = (time.monotonic(), rows)
    return {"places": rows, "source": provider, "crs": "EPSG:4326"}
