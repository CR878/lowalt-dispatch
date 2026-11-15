"""场景加载：把 yaml 任务集和 GeoJSON 几何读成 Python 对象。

只负责"把数据读进来"，不做任何判定。规划器和校验器各自决定怎么用。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from core.geometry import Polygon

REPO_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_DIR = REPO_ROOT / "scenarios" / "v0"
SUITE_PATH = REPO_ROOT / "eval" / "scenarios" / "v0.yaml"


@dataclass(frozen=True)
class Zone:
    """一块限制区。几何在这里，生效时间在场景事件里。"""

    zone_id: str
    polygon: Polygon
    alt_min_m: float
    alt_max_m: float


@dataclass(frozen=True)
class LandingSite:
    site_id: str
    x: float
    y: float
    radius_m: float
    compatible_vehicle_types: tuple[str, ...] = ()
    occupied: bool = False


@dataclass(frozen=True)
class Scene:
    obstacles: list[Polygon]
    zones: dict[str, Zone]
    sites: dict[str, LandingSite]
    crs_note: str = ""


def _read_fc(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"场景几何文件不存在：{path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _ring(feature: dict[str, Any]) -> Polygon:
    coords = feature["geometry"]["coordinates"]
    ring = coords[0] if isinstance(coords[0][0], list) else coords
    return [(float(x), float(y)) for x, y in ring]


def load_scene(scene_dir: Path | None = None) -> Scene:
    d = scene_dir or SCENARIO_DIR

    obs_fc = _read_fc(d / "obstacles.geojson")
    zone_fc = _read_fc(d / "zones.geojson")
    site_fc = _read_fc(d / "landing_sites.geojson")

    obstacles = [_ring(f) for f in obs_fc["features"]]

    zones: dict[str, Zone] = {}
    for f in zone_fc["features"]:
        props = f["properties"]
        zones[props["id"]] = Zone(
            zone_id=props["id"],
            polygon=_ring(f),
            alt_min_m=float(props.get("alt_min_m", 0.0)),
            alt_max_m=float(props.get("alt_max_m", 9999.0)),
        )

    sites: dict[str, LandingSite] = {}
    for f in site_fc["features"]:
        props = f["properties"]
        x, y = f["geometry"]["coordinates"]
        compat = props.get("compatible_vehicle_types") or []
        sites[props["id"]] = LandingSite(
            site_id=props["id"],
            x=float(x),
            y=float(y),
            radius_m=float(props.get("radius_m", 0.0)),
            compatible_vehicle_types=tuple(str(v) for v in compat),
            occupied=bool(props.get("occupied", False)),
        )

    return Scene(obstacles=obstacles, zones=zones, sites=sites, crs_note=obs_fc.get("crs_note", ""))


def load_suite(path: Path | None = None) -> dict[str, Any]:
    p = path or SUITE_PATH
    return yaml.safe_load(p.read_text(encoding="utf-8"))


def zones_known_at_t0(scenario: dict[str, Any], scene: Scene) -> list[Zone]:
    """场景里声明的全部限制区，当作规划全程生效（保守策略）。

    本项目把"飞行中才生效（at_s > 0）的限制区"的精确时变处理留给 `astar_dynamic`
    （目前仍是 mock）。在它落地前，采用保守策略：把所有声明过的限制区都当成立即生效、
    全程存在，避免规划出穿越未来禁飞区的航线。

    这比"基线只该知道 at_s == 0"更保守。校验器的 `_check_restriction` 仍会按生效时刻
    逐点比对，作为更精细的时间轴安全网；本函数只决定搜索网格里哪些格子被堵死。
    """
    out: list[Zone] = []
    for ev in scenario.get("events", []) or []:
        if ev.get("kind") != "restriction_zone":
            continue
        zone = scene.zones.get(ev["zone_id"])
        if zone is not None:
            out.append(zone)
    return out


def endpoint_xy(scenario: dict[str, Any], which: str) -> tuple[float, float]:
    p = scenario[which]
    return float(p["x_m"]), float(p["y_m"])
