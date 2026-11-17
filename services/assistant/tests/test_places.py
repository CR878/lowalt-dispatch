import httpx

from services.assistant import geocode, places


def _photon(*features: dict) -> dict:
    return {"type": "FeatureCollection", "features": list(features)}


def _feature(name: str, lng: float, lat: float, **properties) -> dict:
    return {
        "type": "Feature",
        "properties": {"name": name, "state": "上海市", **properties},
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
    }


def test_search_limits_cache_and_wgs84_without_live_network(client, monkeypatch):
    calls = []

    def handle(request):
        calls.append(request)
        assert request.url.host == "photon.komoot.io"
        return httpx.Response(200, json=_photon(_feature("测试地点", 121.495, 31.241)))

    original = httpx.Client
    monkeypatch.setattr(
        geocode.httpx,
        "Client",
        lambda **kwargs: original(transport=httpx.MockTransport(handle)),
    )
    monkeypatch.setattr(places, "_cache", {})
    monkeypatch.setattr(places, "_next_request", 0)
    response = client.get("/api/assistant/places/search", params={"q": "上海测试"})
    assert response.status_code == 200
    value = response.json()
    assert value["crs"] == "EPSG:4326"
    assert value["places"][0]["point"] == [121.495, 31.241]
    assert value["places"][0]["source"] == "osm_search"
    assert client.get("/api/assistant/places/search", params={"q": "上海测试"}).status_code == 200
    assert len(calls) == 1
    assert client.get("/api/assistant/places/search", params={"q": "不同地点"}).status_code == 429
    assert client.get("/api/assistant/places/search", params={"q": "a"}).status_code == 422


def test_search_failure_and_invalid_coordinates_never_become_places(client, monkeypatch):
    original = httpx.Client

    def invalid(request):
        return httpx.Response(200, json=_photon(_feature("错误坐标", float("nan"), 31.0)))

    monkeypatch.setattr(
        geocode.httpx,
        "Client",
        lambda **kwargs: original(transport=httpx.MockTransport(invalid)),
    )
    monkeypatch.setattr(places, "_cache", {})
    monkeypatch.setattr(places, "_next_request", 0)
    assert places.search_places("错误地点")["places"] == []

    def fail(request):
        return httpx.Response(500)

    monkeypatch.setattr(
        geocode.httpx,
        "Client",
        lambda **kwargs: original(transport=httpx.MockTransport(fail)),
    )
    monkeypatch.setattr(places, "_next_request", 0)
    response = client.get("/api/assistant/places/search", params={"q": "服务失败"})
    assert response.status_code == 200
    assert response.json()["unavailable"] is True
