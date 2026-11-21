from services.assistant.amap import gcj02_to_wgs84


def test_gcj02_to_wgs84_matches_known_airport():
    # Amap returns 121.339775,31.196029 for Shanghai Hongqiao; WGS84 is ~121.3345,31.1977.
    lng, lat = gcj02_to_wgs84(121.339775, 31.196029)
    assert abs(lng - 121.3345) < 0.01
    assert abs(lat - 31.1977) < 0.01
    assert lng < 121.339775
    assert lat > 31.196029


def test_outside_china_is_identity():
    assert gcj02_to_wgs84(-122.4, 37.8) == (-122.4, 37.8)


def test_no_key_means_no_amap_calls(monkeypatch):
    from services.assistant import amap

    monkeypatch.delenv("AMAP_WEB_KEY", raising=False)
    assert amap.lookup("上海虹桥") == []
