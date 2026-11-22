"""Contract tests use clearly synthetic OSM payloads; never production scenes."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from services.assistant.osm_obstacles import (
    ENDPOINTS,
    MAP_SOURCE,
    OSMDataUnavailable,
    _height,
    _parse,
    fetch_obstacles,
    load_cached_scene,
    route_bbox,
)


def geometry(points):
    return [{"lon": x, "lat": y} for x, y in points]


@pytest.mark.parametrize(
    "tags,expected,source",
    [
        ({"height": "24"}, 24, "tag"),
        ({"height": "24 m", "building:levels": "3"}, 24, "tag"),
        ({"height": "100 ft"}, 30.48, "tag"),
        ({"height": "20'"}, 6.096, "tag"),
        ({"building:levels": "8"}, 24, "levels"),
        ({"height": "bad", "building:levels": "2.5"}, 7.5, "levels"),
        ({}, None, "estimate"),
        ({"height": "nan", "building:levels": "unknown"}, None, "estimate"),
    ],
)
def test_height_priority_and_unknown(tags, expected, source):
    result = _height(tags)
    assert (
        result["height_m"] == pytest.approx(expected) if expected is not None else result["height_m"] is None
    )
    assert result["height_source"] == source
    assert result["height_estimated"] is (source != "tag")


def sample_payload():
    return {
        "elements": [
            {
                "type": "way",
                "id": 1,
                "tags": {"building": "yes", "height": "24"},
                "geometry": geometry([(121, 31), (121.001, 31), (121.001, 31.001), (121, 31)]),
            },
            {
                "type": "way",
                "id": 2,
                "tags": {"highway": "primary", "name": "test fixture road"},
                "geometry": geometry([(121, 31), (121.002, 31)]),
            },
        ]
    }


def test_real_cache_provenance_and_no_second_network_call(tmp_path):
    calls = []

    def upstream(request):
        calls.append(request)
        assert "building" in request.content.decode()
        return httpx.Response(200, json=sample_payload())

    with httpx.Client(transport=httpx.MockTransport(upstream)) as client:
        result = fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
        again = fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    assert len(calls) == 1
    assert again["metadata"]["cache_hit"] is True
    scene = load_cached_scene(result["metadata"]["scene_id"], tmp_path)
    assert len(scene["obstacles"]["features"]) == 1
    assert len(scene["roads"]["features"]) == 1
    props = scene["obstacles"]["features"][0]["properties"]
    assert props["id"] == "osm-way-1"
    assert props["height_source"] == "tag"
    assert props["status"] == "real"
    assert props["tags"] == {"building": "yes", "height": "24"}
    assert scene["obstacles"]["bbox"] == result["metadata"]["bbox"]


def test_upstream_error_and_stale_cache_never_fall_back(tmp_path):
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=sample_payload()))
    ) as client:
        result = fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    scene_id = result["metadata"]["scene_id"]
    manifest = tmp_path / scene_id / "metadata.json"
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    metadata["fetched_at"] = (datetime.now(UTC) - timedelta(days=3)).isoformat()
    metadata["source_fetched_at"] = metadata["fetched_at"]
    manifest.write_text(json.dumps(metadata), encoding="utf-8")
    with pytest.raises(OSMDataUnavailable, match="过期"):
        load_cached_scene(scene_id, tmp_path)
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(504))) as client:
        with pytest.raises(OSMDataUnavailable, match="未回退到仿真"):
            fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)


def test_overpass_remark_is_not_a_complete_success(tmp_path):
    payload = sample_payload() | {"remark": "runtime error: Query timed out"}
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=payload))) as client:
        with pytest.raises(OSMDataUnavailable):
            fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    assert not list(tmp_path.rglob("metadata.json"))


def test_multipolygon_joins_fragments_and_keeps_hole():
    a, b, c, d = [121, 31], [121.01, 31], [121.01, 31.01], [121, 31.01]
    inner = [[121.002, 31.002], [121.004, 31.002], [121.004, 31.004], [121.002, 31.002]]
    payload = {
        "elements": [
            {
                "type": "relation",
                "id": 7,
                "tags": {"building": "yes"},
                "members": [
                    {"type": "way", "role": "outer", "geometry": geometry([a, b, c])},
                    {"type": "way", "role": "outer", "geometry": geometry([a, d, c])},
                    {"type": "way", "role": "inner", "geometry": geometry(inner)},
                ],
            }
        ]
    }
    result = _parse(payload, [121, 31, 121.1, 31.1], "2026-11-17T01:00:00Z", "test")
    feature = result["obstacles"]["features"][0]
    assert feature["geometry"]["type"] == "Polygon"
    assert len(feature["geometry"]["coordinates"]) == 2
    assert feature["properties"]["height_m"] is None
    assert feature["properties"]["height_source"] == "estimate"


def test_incomplete_building_geometry_is_rejected():
    payload = sample_payload()
    payload["elements"][0]["geometry"][1] = {"lat": 31}
    with pytest.raises(OSMDataUnavailable, match="缺失坐标"):
        _parse(payload, [121, 31, 121.1, 31.1], "2026-11-17T01:00:00Z", "test")


@pytest.mark.parametrize("scene_id", ["../v0", "a" * 17, "not-an-id"])
def test_scene_path_is_not_user_controlled(scene_id, tmp_path):
    with pytest.raises(OSMDataUnavailable):
        load_cached_scene(scene_id, tmp_path)


def test_bbox_is_outward_and_not_a_fixed_demo_anchor():
    bbox = route_bbox((121.335209, 31.197950), (121.804400, 31.144383), 1000)
    assert bbox[0] < 121.3247 and bbox[2] > 121.8149
    assert bbox[1] < 31.1354 and bbox[3] > 31.2069


def test_zero_features_still_report_osm_coverage_limit(tmp_path):
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"elements": []}))
    ) as client:
        result = fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    assert result["metadata"]["building_count"] == 0
    assert "completeness not guaranteed" in result["metadata"]["coverage"]
    assert result["warnings"]


def test_primary_map_fallback_is_real_and_distinctly_attributed(tmp_path):
    xml = b"""<osm version="0.6">
      <node id="1" lon="121" lat="31"/><node id="2" lon="121.001" lat="31"/>
      <node id="3" lon="121.001" lat="31.001"/>
      <way id="5" timestamp="2025-01-01T00:00:00Z">
        <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
        <tag k="building" v="yes"/><tag k="height" v="18"/>
      </way>
      <way id="6"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way>
    </osm>"""
    calls = []

    def upstream(request):
        calls.append(request)
        return httpx.Response(503) if request.method == "POST" else httpx.Response(200, content=xml)

    with httpx.Client(transport=httpx.MockTransport(upstream)) as client:
        result = fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    assert len(calls) == len(ENDPOINTS) + 1
    assert result["metadata"]["source"] == MAP_SOURCE
    assert result["obstacles"]["source"] == MAP_SOURCE
    assert result["obstacles"]["features"][0]["properties"]["source"] == MAP_SOURCE
    assert result["obstacles"]["features"][0]["properties"]["height_m"] == 18
    assert result["metadata"]["overpass_errors"]
    cached = load_cached_scene(result["metadata"]["scene_id"], tmp_path)
    assert cached["warnings"] == result["warnings"]


def test_primary_map_missing_node_refuses_partial_footprint(tmp_path):
    xml = b'<osm><way id="5"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/><tag k="building" v="yes"/></way></osm>'
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(503) if r.method == "POST" else httpx.Response(200, content=xml)
        )
    ) as client:
        with pytest.raises(OSMDataUnavailable, match="缺少坐标"):
            fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    assert not list(tmp_path.rglob("metadata.json"))


def test_bad_osm_roles_derive_explicit_hull_of_real_nodes_only():
    points = [(121, 31), (121.001, 31), (121.001, 31.001), (121, 31)]
    member = {"type": "way", "ref": 42, "role": "inner", "geometry": geometry(points)}
    payload = {
        "elements": [
            {
                "type": "relation",
                "id": 99,
                "tags": {"building": "yes", "type": "multipolygon"},
                "members": [member],
            }
        ]
    }
    result = _parse(payload, [121, 31, 121.1, 31.1], "2026-11-17T01:00:00Z", "test")
    feature = result["obstacles"]["features"][0]
    assert feature["properties"]["geometry_status"] == "derived_conservative"
    assert feature["properties"]["geometry_method"] == "convex_hull_of_osm_member_nodes"
    assert feature["properties"]["original_geometry"]["members"] == [member]
    assert feature["properties"]["original_geometry"]["members"][0]["role"] == "inner"
    assert set(map(tuple, feature["geometry"]["coordinates"][0])) == set(points)
    assert result["metadata"]["derived_geometry_count"] == 1
    assert any("凸包" in warning for warning in result["warnings"])


def test_partial_relation_coordinates_cannot_be_repaired_with_hull():
    payload = {
        "elements": [
            {
                "type": "relation",
                "id": 99,
                "tags": {"building": "yes"},
                "members": [
                    {
                        "type": "way",
                        "ref": 42,
                        "role": "inner",
                        "geometry": geometry([(121, 31), (121.01, 31), (121.01, 31.01), (121, 31)]),
                    },
                    {"type": "way", "ref": 43, "role": "inner"},
                ],
            }
        ]
    }
    with pytest.raises(OSMDataUnavailable, match="缺失坐标/成员"):
        _parse(payload, [121, 31, 121.1, 31.1], "2026-11-17T01:00:00Z", "test")


def test_empty_regional_mirror_is_skipped_for_a_later_endpoint(tmp_path, monkeypatch):
    """An empty 200 must not mask a later endpoint that has real data."""
    from services.assistant import osm_obstacles as module

    calls = []

    def upstream(request):
        calls.append(str(request.url))
        if "empty-mirror" in str(request.url):
            return httpx.Response(200, json={"elements": []})
        return httpx.Response(200, json=sample_payload())

    monkeypatch.setattr(
        module,
        "ENDPOINTS",
        ("https://empty-mirror.invalid/api/interpreter", "https://data.invalid/api/interpreter"),
    )
    with httpx.Client(transport=httpx.MockTransport(upstream)) as client:
        result = fetch_obstacles((121, 31), (121.002, 31), client=client, cache_dir=tmp_path)
    assert len(calls) == 2
    assert len(result["obstacles"]["features"]) == 1
