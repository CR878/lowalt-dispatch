"""Bounded geometric alternatives for the fixed ENU scene. No flight commands."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache

from pydantic import BaseModel, ConfigDict, Field, model_validator

from planner.astar import plan
from planner.grid import build_grid
from planner.scene import load_scene


class ScenePoint(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float = Field(ge=10, le=2990)
    y: float = Field(ge=10, le=2990)


class CandidateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    origin: ScenePoint
    destination: ScenePoint
    frame: str = Field(pattern="^ENU$")

    @model_validator(mode="after")
    def distinct(self):
        if (self.origin.x - self.destination.x) ** 2 + (self.origin.y - self.destination.y) ** 2 < 100:
            raise ValueError("起终点至少相距10米")
        return self


@lru_cache(maxsize=2)
def scene_grid(clearance):
    scene = load_scene()
    return build_grid(scene.obstacles + [z.polygon for z in scene.zones.values()], clearance_m=clearance)


def candidate_routes(body: CandidateInput):
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
                "clearance_m": clearance,
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
        "limitation": "仅固定3km ENU场景。30/60m为栅格膨胀参数，不是实测净空；全部限制区保守静态避让。"
        "未校验高度、机型、风、时效、能耗与备降可达，不能用于真实地点或直接飞行。",
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
