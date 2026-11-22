"""Fetch and audit a real geographic planning attempt, without flight commands.

Run from the repository root, for example::

    .venv/Scripts/python.exe -m tools.verify_real_route \
        --origin LNG,LAT --destination LNG,LAT --output results/probe.json

Coordinates are required; there are no demo route or weather defaults. A cached
scene may be selected explicitly to reproduce another route within its observed
bbox. Exit codes: 0 verified route, 2 truthful no-route, 1 unavailable/error,
3 an evidence contract failed. A geometric route never grants flight approval.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, shape
from shapely.strtree import STRtree

from core.console import ensure_utf8_stdout
from planner.georef import METRES_PER_DEGREE, distance_m, wgs84_to_enu
from planner.real import plan_real_route
from services.assistant.osm_obstacles import fetch_obstacles, load_cached_scene
from services.assistant.route_weather import assess_route_weather


def coordinates(value: str) -> tuple[float, float]:
    try:
        lon, lat = map(float, value.split(","))
        distance_m((lon, lat), (lon, lat))
        return lon, lat
    except (ValueError, TypeError) as exc:
        raise argparse.ArgumentTypeError("坐标必须为有限 WGS84 经度,纬度，例如 121.4,31.2") from exc


def _expected_height(tags):
    # Independently audit the persisted values against their retained raw tags.
    number = r"[+]?(?:\d+(?:\.\d*)?|\.\d+)"
    height = re.fullmatch(
        rf"({number})\s*(m|metres?|meters?|ft|feet|foot|')?", str(tags.get("height", "")).strip().lower()
    )
    if height:
        value = float(height.group(1))
        if height.group(2) in {"ft", "feet", "foot", "'"}:
            value *= 0.3048
        if math.isfinite(value) and value > 0:
            return value, "tag"
    levels = str(tags.get("building:levels", "")).strip()
    if re.fullmatch(number, levels) and 0 < float(levels) < 1000:
        return float(levels) * 3, "levels"
    return None, "estimate"


def height_audit(features, scene_id):
    """Select five reproducible random buildings; raw tags remain reviewable."""
    rng = random.Random(scene_id)
    selected = rng.sample(features, min(5, len(features)))
    results = []
    for feature in selected:
        props = feature["properties"]
        tags = props.get("tags") or {}
        expected, source = _expected_height(tags)
        actual = props.get("height_m")
        matches = (
            actual is None
            if expected is None
            else isinstance(actual, (int, float)) and math.isclose(actual, expected, abs_tol=1e-9)
        )
        results.append(
            {
                "id": props.get("id"),
                "osm_url": props.get("osm_url"),
                "raw_height": tags.get("height"),
                "raw_building_levels": tags.get("building:levels"),
                "height_m": actual,
                "height_source": props.get("height_source"),
                "expected_height_m": expected,
                "expected_height_source": source,
                "matches_raw_tags": matches and props.get("height_source") == source,
                "height_method": props.get("height_method"),
                "note": "标签值不等于独立实测；levels×3m 是估算，无标签保持 null。",
            }
        )
    return results


def continuous_distance_check(waypoints, features, reference):
    """Independently reconstruct geometry and measure the whole output line."""
    if len(waypoints) < 2:
        return {"status": "unavailable", "reason": "未找到路线"}
    if not features:
        return {"status": "unavailable", "reason": "未返回建筑，不代表现实中无障碍"}

    def project(lons, lats):
        return (
            (np.asarray(lons) - reference[0]) * METRES_PER_DEGREE * math.cos(math.radians(reference[1])),
            (np.asarray(lats) - reference[1]) * METRES_PER_DEGREE,
        )

    polygons = [shapely.transform(shape(f["geometry"]), project, interleaved=False) for f in features]
    tree = STRtree(polygons)
    line = LineString([wgs84_to_enu(reference, tuple(p)) for p in waypoints])
    nearest = tree.nearest(line)
    return {
        "status": "checked",
        "minimum_distance_m": line.distance(polygons[int(nearest)]),
        "frame": "同一局部等距圆柱米制近似；完整连续折线与原始建筑几何距离",
        "nearest_osm_id": features[int(nearest)]["properties"].get("id"),
    }


def run_probe(args):
    began = time.perf_counter()
    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "purpose": "真实数据获取及水平几何规划验证；不是实际飞行验证",
        "request": {
            "origin": args.origin,
            "destination": args.destination,
            "scheduled_for": args.scheduled_for,
            "resolution_m": args.resolution_m,
            "selected_scene_id": args.scene_id,
        },
        "straight_distance_m": distance_m(args.origin, args.destination),
        "dispatch_enabled": False,
        "airspace": "manual_review_required",
        "virtual_data_substituted": False,
    }
    try:
        data = (
            load_cached_scene(args.scene_id)
            if args.scene_id
            else fetch_obstacles(args.origin, args.destination, margin_m=1000)
        )
        fetched = time.perf_counter()
        report["data"] = data["metadata"]
        report["sample_building_height_audit"] = height_audit(
            data["obstacles"]["features"], data["metadata"]["scene_id"]
        )
        result = plan_real_route(
            args.origin, args.destination, data["obstacles"], resolution_m=args.resolution_m
        )
        planned = time.perf_counter()
        report["planning"] = result
        weather = assess_route_weather(result["waypoints"], args.scheduled_for, vehicle_key=args.vehicle_key)
        report["weather"] = weather
        report["continuous_geometry_audit"] = continuous_distance_check(
            result["waypoints"],
            data["obstacles"]["features"],
            result["projection_origin"],
        )
        report["checks"] = {
            "source_status_real": data["metadata"].get("status") == "real",
            "height_samples_match_raw_tags": all(
                s["matches_raw_tags"] for s in report["sample_building_height_audit"]
            ),
            "exact_endpoints_preserved": bool(
                result["found"]
                and result["waypoints"][0] == args.origin
                and result["waypoints"][-1] == args.destination
            ),
            "waypoint_limit_met": len(result["waypoints"]) <= 1000,
            "planning_under_30s": result["elapsed_ms"] < 30000,
            "horizontal_clearance_verified": bool(result.get("continuous_clearance_verified"))
            and (
                report["continuous_geometry_audit"].get("minimum_distance_m", 0)
                >= result["clearance_m"] - 1e-6
            ),
            "no_flight_commands": True,
        }
        report["timings_s"] = {
            "data_fetch_or_cache_load": fetched - began,
            "planning_including_height_audit": planned - fetched,
            "weather_and_independent_audit": time.perf_counter() - planned,
            "total": time.perf_counter() - began,
        }
        if not result["found"]:
            report["status"] = "no_route"
            return report, 2
        report["status"] = "verified_geometric_route" if all(report["checks"].values()) else "contract_failed"
        return report, 0 if report["status"] == "verified_geometric_route" else 3
    except (OSError, ValueError, TypeError, KeyError, RuntimeError) as exc:
        report.update({"status": "unavailable", "reason": str(exc), "elapsed_s": time.perf_counter() - began})
        return report, 1


def main(argv=None):
    ensure_utf8_stdout()
    # JSON evidence contains OSM's © attribution, which GBK cannot encode even
    # though it supports Chinese. Always emit this CLI's JSON as UTF-8.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--origin", required=True, type=coordinates, help="起点 WGS84 经度,纬度，不提供虚拟默认值"
    )
    parser.add_argument(
        "--destination", required=True, type=coordinates, help="终点 WGS84 经度,纬度，不提供虚拟默认值"
    )
    parser.add_argument("--scheduled-for", help="带时区 ISO8601 起飞时刻；省略则请求当前模式预报")
    parser.add_argument("--vehicle-key", help="有来源且标定的真实机型；省略保持能耗不可用")
    parser.add_argument(
        "--resolution-m",
        type=int,
        choices=(10, 20, 30),
        default=10,
        help="默认10m（真实45km任务已验证）；20/30m更保守，可能封闭城市窄通道",
    )
    parser.add_argument("--scene-id", help="显式复用已获取的有效完整真实场景，不重新抓取；航线须在 bbox 内")
    parser.add_argument("--output", type=Path, help="保存完整 JSON 证据，仍打印到 stdout")
    args = parser.parse_args(argv)
    report, code = run_probe(args)
    serialized = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    return code


if __name__ == "__main__":
    sys.exit(main())
