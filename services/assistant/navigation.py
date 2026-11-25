"""Geometric alternatives with explicit ENU simulation and real WGS84 data."""

from __future__ import annotations

import hashlib
import json
import math
import time
from datetime import UTC, datetime
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from planner.astar import plan
from planner.grid import build_grid
from planner.scene import load_scene
from services.assistant import route_weather
from services.assistant.vehicles import VehicleSelection, evaluate_vehicle


class ScenePoint(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float = Field(ge=10, le=2990)
    y: float = Field(ge=10, le=2990)


class GeographicPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-80, le=80)


class AvoidRegion(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=160)
    kind: Literal["restricted", "internal"]
    geometry: dict
    source: str = Field(min_length=1, max_length=300)
    source_ref: str = Field(default="", max_length=1000)
    effective_from: str | None = None
    effective_until: str | None = None

    @model_validator(mode="after")
    def valid(self):
        from shapely.geometry import shape

        if self.geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            raise ValueError("限制区仅支持 Polygon/MultiPolygon")
        rings = self.geometry.get("coordinates", [])
        polygons = [rings] if self.geometry["type"] == "Polygon" else rings
        if (
            not isinstance(polygons, list)
            or not polygons
            or any(not isinstance(p, list) or not p for p in polygons)
        ):
            raise ValueError("限制区多边形结构无效")
        if any(
            not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1] for p in polygons for ring in p
        ):
            raise ValueError("限制区环必须闭合且至少四点")
        vertices = [p for polygon in polygons for ring in polygon for p in ring]
        if (
            not vertices
            or len(vertices) > 5000
            or any(
                not isinstance(p, list)
                or len(p) != 2
                or not all(
                    isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in p
                )
                or not (-180 <= p[0] <= 180 and -80 <= p[1] <= 80)
                for p in vertices
            )
        ):
            raise ValueError("限制区坐标无效或顶点过多")
        geom = shape(self.geometry)
        if geom.is_empty or not geom.is_valid:
            raise ValueError("限制区拓扑无效")
        for value in (self.effective_from, self.effective_until):
            if value is not None and datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is None:
                raise ValueError("限制区时刻须包含时区")
        if (
            self.effective_from
            and self.effective_until
            and datetime.fromisoformat(self.effective_until.replace("Z", "+00:00"))
            <= datetime.fromisoformat(self.effective_from.replace("Z", "+00:00"))
        ):
            raise ValueError("限制区时间范围无效")
        return self


class CandidateInput(VehicleSelection):
    model_config = ConfigDict(extra="forbid")
    origin: ScenePoint | GeographicPoint
    destination: ScenePoint | GeographicPoint
    frame: Literal["ENU", "WGS84"]
    scheduled_for: str | None = None
    resolution_m: Literal[10, 20, 30] = 10
    max_expand: int = Field(default=500_000, ge=1000, le=1_000_000)
    avoid_regions: list[AvoidRegion] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def distinct(self):
        if self.scheduled_for is not None:
            instant = datetime.fromisoformat(self.scheduled_for.replace("Z", "+00:00"))
            if instant.tzinfo is None:
                raise ValueError("起飞时刻须包含时区")
        if self.frame == "WGS84":
            from planner.georef import distance_m

            if not isinstance(self.origin, GeographicPoint) or not isinstance(
                self.destination, GeographicPoint
            ):
                raise ValueError("WGS84 起终点须使用 lng、lat，经度在前")
            start = (self.origin.lng, self.origin.lat)
            goal = (self.destination.lng, self.destination.lat)
            distance = distance_m(start, goal)
            if abs(start[0] - goal[0]) > 180 or distance > 80_000:
                raise ValueError("真实航线限80km局部区域，跨日期变更线请分段规划")
        else:
            if self.avoid_regions:
                raise ValueError("WGS84 导入限制区不能绑定到 ENU 演示锚点，请使用真实坐标规划")
            if not isinstance(self.origin, ScenePoint) or not isinstance(self.destination, ScenePoint):
                raise ValueError("ENU 起终点须使用固定仿真场景 x、y")
            distance = (
                (self.origin.x - self.destination.x) ** 2 + (self.origin.y - self.destination.y) ** 2
            ) ** 0.5
        if distance < 10:
            raise ValueError("起终点至少相距10米")
        return self


@lru_cache(maxsize=2)
def scene_grid(clearance):
    scene = load_scene()
    return build_grid(scene.obstacles + [z.polygon for z in scene.zones.values()], clearance_m=clearance)


def candidate_routes(body: CandidateInput):
    if body.frame == "WGS84":
        return real_candidate_routes(body)
    start = (body.origin.x, body.origin.y)
    goal = (body.destination.x, body.destination.y)
    signature = hashlib.sha256(json.dumps([start, goal]).encode()).hexdigest()[:12]
    alternatives = []
    for clearance, title in ((30, "标准净空 · 几何A*"), (60, "加宽净空 · 几何A*")):
        result = plan(scene_grid(clearance), start, goal, max_expand=90000)
        available = result.found and not result.snapped
        alternatives.append(
            {
                "id": f"nav-{signature}-{clearance}",
                "title": title,
                "available": available,
                "clearance_m": route_weather.truncate_reported(clearance, 1),
                "reason": None if available else "该净空下无可用路线或端点被占用，需人工调整；未移动端点。",
                "route": {
                    "id": f"nav-{signature}-{clearance}",
                    "title": title,
                    "source": "planner.astar.plan · 固定场景静态几何计算",
                    "frame": "ENU",
                    "altitude_ref": None,
                    "is_simulated": True,
                    "task_id": None,
                    "plan_version": None,
                    "waypoints": [{"x": x, "y": y} for x, y in collapse_collinear(result.waypoints)],
                }
                if available
                else None,
            }
        )
    return {
        "alternatives": alternatives,
        "dispatch_enabled": False,
        "is_simulated": True,
        "precision_note": route_weather.PRECISION_NOTE,
        "limitation": "仅固定3km ENU场景。30/60m为栅格膨胀参数，不是实测净空；全部限制区保守静态避让。"
        "未校验高度、机型、风、时效、能耗与备降可达，不能用于真实地点或直接飞行。",
    }


def real_candidate_routes(body: CandidateInput, *, budget_total_s: float = 42.0):
    from planner.real import plan_real_route
    from services.assistant.osm_obstacles import fetch_obstacles
    from services.assistant.route_weather import assess_route_weather

    if not math.isfinite(budget_total_s) or budget_total_s <= 0:
        raise ValueError("真实航线总时间预算必须为有限正数")
    start = (body.origin.lng, body.origin.lat)
    goal = (body.destination.lng, body.destination.lat)
    # Leave the rest of the caller budget for rasterization and search.
    fetch_budget = min(18.0, max(1.0, budget_total_s * 0.45))
    dataset = fetch_obstacles(start, goal, margin_m=1000, budget_s=fetch_budget, max_workers=2)
    metadata = dict(dataset["metadata"])
    departure = (
        datetime.fromisoformat(body.scheduled_for.replace("Z", "+00:00"))
        if body.scheduled_for
        else datetime.now(UTC)
    )
    enforced = [
        r
        for r in body.avoid_regions
        if not r.effective_until
        or datetime.fromisoformat(r.effective_until.replace("Z", "+00:00")) > departure
    ]
    exclusions = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": r.id}, "geometry": r.geometry} for r in enforced
        ],
    }

    # Coarse resolutions (20/30 m) carry a larger half-cell margin, so dense
    # urban corridors can be sealed even when a 10 m grid is traversable. That is
    # a safety-margin consequence, not a search bug. We therefore retry at 10 m
    # and report every attempt instead of silently changing the clearance or
    # claiming the coarse request succeeded.
    plan_attempts = []
    result = None
    attempt = None
    resolution_used = body.resolution_m
    deadline = time.perf_counter() + budget_total_s
    for resolution in sorted({body.resolution_m, 10}, reverse=True):
        remaining = deadline - time.perf_counter()
        if remaining <= 2:
            plan_attempts.append(
                {
                    "resolution_m": resolution,
                    "found": False,
                    "reason": "总时间预算耗尽，未尝试该分辨率",
                    "nodes_expanded": 0,
                    "elapsed_ms": 0,
                    "length_m": None,
                }
            )
            continue
        attempt = plan_real_route(
            start,
            goal,
            dataset["obstacles"],
            exclusions_fc=exclusions,
            resolution_m=resolution,
            max_expand=body.max_expand,
            budget_s=min(28.0, remaining),
        )
        plan_attempts.append(
            {
                "resolution_m": resolution,
                "found": attempt["found"],
                "reason": attempt.get("reason"),
                "nodes_expanded": attempt["nodes_expanded"],
                "elapsed_ms": round(attempt["elapsed_ms"], 1),
                "length_m": round(attempt["length_m"], 1) if attempt["found"] else None,
            }
        )
        if attempt["found"]:
            result, resolution_used = attempt, resolution
            break
    if result is None:
        if attempt is None:
            raise RuntimeError("真实航线规划没有可用时间预算，未开始任何搜索")
        # Keep the coarsest failure as the headline result; attempts carry detail.
        result = attempt
    warnings = list(dataset.get("warnings", [])) + list(result.get("warnings", []))
    if resolution_used != body.resolution_m:
        warnings.append(
            f"请求分辨率 {body.resolution_m:g} m 在 20 m 物理净空下无可行通道，已自动改用 "
            f"{resolution_used:g} m 重新搜索；净空标准未降低。"
        )
    warnings += [
        "真实空域未接入，NOTAM / UOM 及机场、人口密集区限制须人工核对；此结果不代表获准飞行。",
        "只验证所下载建筑足迹的水平避障；未验证地形、电线、塔吊、移动障碍和垂直航路。",
        "道路来自 OSM，仅作地理参照，未视作获准飞行走廊。",
    ]
    found = result["found"]
    weather = (
        assess_route_weather(
            result["waypoints"],
            body.scheduled_for,
            vehicle_key=body.vehicle_key,
            custom_vehicle=body.custom_vehicle,
            obstacles=dataset["obstacles"],
        )
        if found
        else {
            "status": "unavailable",
            "source": "Open-Meteo / hourly forecast",
            "warnings": ["未找到几何航线，未请求航路天气"],
            "energy": {"status": "unavailable", "reason": "无几何航线"},
        }
    )
    warnings += weather.get("warnings", [])
    signature = hashlib.sha256(
        json.dumps(
            [
                start,
                goal,
                metadata.get("fetched_at"),
                resolution_used,
                result.get("heuristic_weight"),
                result["waypoints"],
            ]
        ).encode()
    ).hexdigest()[:12]
    title = "几何 A* · OSM 真实建筑足迹 · 空域待人工核对"
    route = (
        {
            "id": f"real-{signature}",
            "title": title,
            "frame": "WGS84",
            "altitude_ref": None,
            "is_simulated": False,
            "source": f"{metadata['source']} · planner.real · 水平几何参考",
            "task_id": None,
            "plan_version": None,
            "waypoints": [{"x": lng, "y": lat, "lng": lng, "lat": lat} for lng, lat in result["waypoints"]],
            "length_m": route_weather.truncate_reported(result["length_m"], 1),
        }
        if found
        else None
    )
    plan_stages = result.get("stage_timings_ms") or {}
    metadata["plan_stage_timings_ms"] = {
        "rasterization": plan_stages.get("rasterization"),
        "astar_search": plan_stages.get("astar_search"),
    }
    reported_clearance = route_weather.truncate_reported(result["clearance_m"], 1)
    reported_length = route["length_m"] if route is not None else None
    assessment = evaluate_vehicle(body, reported_length)
    estimate = assessment.get("estimate")
    duration = estimate.get("duration_s") if isinstance(estimate, dict) else None
    if isinstance(duration, (int, float)) and not isinstance(duration, bool):
        estimate["duration_s"] = route_weather.truncate_reported(duration, 1)
    return {
        "status": "ok" if found else "no_route",
        "frame": "WGS84",
        "alternatives": [
            {
                "id": f"real-{signature}",
                "title": title,
                "available": found,
                "clearance_m": reported_clearance,
                "reason": result.get("reason"),
                "route": route,
            }
        ],
        "route": route,
        "scene_id": metadata.get("scene_id"),
        "dispatch_enabled": False,
        "is_simulated": False,
        "geometric_available": found,
        "operationally_approved": False,
        "continuous_clearance_verified": result.get("continuous_clearance_verified", False),
        "flight_feasibility": weather.get("flight_feasibility", {"status": "unavailable"}),
        "vehicle_assessment": assessment,
        "obstacle_source": metadata["source"],
        "weather_source": weather["source"],
        "airspace": {
            "status": "user_exclusions_applied" if enforced else "manual_review_required",
            "source": "用户导入参考；来源未独立核验",
            "enforced_ids": [r.id for r in enforced],
            "dispatch_enabled": False,
            "note": "对尚未过期的禁飞/内部管制多边形保守作全高度避让（含未来生效、时效未知）；其他类别仅展示，未接官方空域服务。",
        },
        "avoid_regions": [r.model_dump() for r in body.avoid_regions],
        "clearance_m": reported_clearance,
        "precision_note": route_weather.PRECISION_NOTE,
        "grid_clearance_m": result.get("grid_clearance_m"),
        "resolution_m": result["resolution_m"],
        "resolution_requested_m": body.resolution_m,
        "resolution_used_m": resolution_used,
        "plan_attempts": plan_attempts,
        "heuristic_weight": result.get("heuristic_weight"),
        "nodes_expanded": result["nodes_expanded"],
        "elapsed_ms": result["elapsed_ms"],
        "stage_timings_ms": result.get("stage_timings_ms", {}),
        "data": metadata,
        "weather": weather,
        "warnings": list(dict.fromkeys(warnings)),
        "limitation": "真实建筑、道路来自公开地图，可能漏测；高度含标签推算或未知，不作越顶依据。真实空域、垂直净空、平台能耗须另行核验。",
    }


def collapse_collinear(points):
    """Remove grid samples on the same straight segment without changing geometry."""
    result = []
    for point in points:
        while len(result) >= 2:
            a, b = result[-2:]
            u, v = (b[0] - a[0], b[1] - a[1]), (point[0] - b[0], point[1] - b[1])
            if abs(u[0] * v[1] - u[1] * v[0]) > 1e-7 or u[0] * v[0] + u[1] * v[1] <= 0:
                break
            result.pop()
        result.append(point)
    return result
