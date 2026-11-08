"""规划器与能量模型的测试。

重点不是"算法跑得对"，而是：
1. A* 给出的路径**真的**不穿障碍 —— 用 point_in_polygon 逐点独立判定，
   不复用栅格（复用栅格等于让规划器给自己打分）；
2. 机型参数缺失时**必须报错**，不能悄悄用默认值算出一个像样的数字。
"""

from __future__ import annotations

import math

import pytest

from core.geometry import point_in_polygon, polyline_length, sample_polyline
from planner.astar import plan, plan_scenario
from planner.grid import build_grid, snap_to_free
from planner.scene import endpoint_xy, load_scene, load_suite, zones_known_at_t0
from sim.energy import (
    IncompleteVehicleProfile,
    VehicleProfile,
    climb_energy_wh,
    cruise_energy_wh,
    leg_energy_wh,
    load_vehicle,
    max_range_m,
)

CLEARANCE_M = 20.0


# --------------------------------------------------------------------------- #
# 几何原语
# --------------------------------------------------------------------------- #
def test_polygon_mask_matches_point_in_polygon() -> None:
    import numpy as np

    from core.geometry import polygon_mask, rect_polygon

    poly = rect_polygon(10, 10, 30, 30)
    xs = np.array([[5, 20, 35]], dtype=float)
    ys = np.array([[20, 20, 20]], dtype=float)
    mask = polygon_mask(xs, ys, poly)
    for k in range(3):
        assert bool(mask[0, k]) == point_in_polygon(float(xs[0, k]), float(ys[0, k]), poly)


def test_sample_polyline_covers_full_length() -> None:
    pts = [(0.0, 0.0), (100.0, 0.0), (100.0, 50.0)]
    samples = sample_polyline(pts, 10.0)
    assert samples[0][0] == 0.0
    assert samples[-1][0] <= polyline_length(pts)
    assert len(samples) >= 14  # 150 m / 10 m


# --------------------------------------------------------------------------- #
# A* 基本行为
# --------------------------------------------------------------------------- #
def test_astar_goes_straight_in_open_field() -> None:
    grid = build_grid([], x0=0, y0=0, x1=1000, y1=1000)
    res = plan(grid, (100.0, 500.0), (900.0, 500.0))
    assert res.found
    assert res.length_m == pytest.approx(800.0, rel=0.05)


def test_astar_detours_around_wall_with_gap() -> None:
    from core.geometry import rect_polygon

    grid = build_grid([rect_polygon(0, 400, 600, 600)], x0=0, y0=0, x1=1000, y1=1000)
    res = plan(grid, (100.0, 200.0), (900.0, 800.0))
    assert res.found
    straight = math.hypot(800, 600)
    assert res.length_m > straight * 1.1, "撞墙必须绕路，不能穿过去"
    assert max(x for x, _ in res.waypoints) > 600.0, "应该从缺口（x>600）绕过去"


def test_astar_reports_no_path_for_sealed_goal() -> None:
    from core.geometry import rect_polygon

    sealed = rect_polygon(400, 400, 600, 600)
    grid = build_grid([sealed], x0=0, y0=0, x1=1000, y1=1000, clearance_m=30)
    res = plan(grid, (100.0, 100.0), (500.0, 500.0))
    assert not res.found
    assert res.reason is not None
    assert "终点" in res.reason or "不可" in res.reason or "耗尽" in res.reason


def test_clearance_thickens_obstacles() -> None:
    from core.geometry import rect_polygon

    poly = rect_polygon(400, 400, 600, 600)
    thin = build_grid([poly], x0=0, y0=0, x1=1000, y1=1000, clearance_m=0)
    thick = build_grid([poly], x0=0, y0=0, x1=1000, y1=1000, clearance_m=40)
    assert thick.blocked_ratio > thin.blocked_ratio


def test_snap_to_free_finds_neighbour() -> None:
    from core.geometry import rect_polygon

    grid = build_grid([rect_polygon(400, 400, 600, 600)], x0=0, y0=0, x1=1000, y1=1000, clearance_m=30)
    # (620, 500) 在障碍外 20 m，但落在 30 m 净空带以内 —— 正是端点"差一点"的典型情形
    snapped = snap_to_free(grid, 620.0, 500.0)
    assert snapped is not None
    assert grid.free(*snapped)

    # 障碍正中心应该放弃，而不是硬凑一个位置
    assert snap_to_free(grid, 500.0, 500.0) is None


# --------------------------------------------------------------------------- #
# 全场景：路径真的不穿障碍（独立判定）
# --------------------------------------------------------------------------- #
def test_all_scenario_paths_are_truly_obstacle_free() -> None:
    scene = load_scene()
    suite = load_suite()

    for sc in suite["scenarios"]:
        res, _grid = plan_scenario(sc, scene)
        if not res.found:
            continue
        blockers = list(scene.obstacles) + [z.polygon for z in zones_known_at_t0(sc, scene)]
        for _s, (px, py) in sample_polyline(res.waypoints, 2.0):
            for poly in blockers:
                assert not point_in_polygon(px, py, poly), (
                    f"{sc['id']} 的路径点 ({px:.0f}, {py:.0f}) 落在障碍内 —— "
                    f"栅格化或净空处理有漏洞"
                )


def test_endpoints_match_scenario_definition() -> None:
    scene = load_scene()
    suite = load_suite()
    for sc in suite["scenarios"]:
        res, _grid = plan_scenario(sc, scene)
        if not res.found:
            continue
        assert res.waypoints[0] == endpoint_xy(sc, "origin")
        assert res.waypoints[-1] == endpoint_xy(sc, "destination")


def test_s4_04_infeasible_because_destination_is_restricted() -> None:
    scene = load_scene()
    suite = {sc["id"]: sc for sc in load_suite()["scenarios"]}
    res, _grid = plan_scenario(suite["S4-04"], scene)
    assert not res.found
    assert res.reason is not None and "终点" in res.reason


# --------------------------------------------------------------------------- #
# 能量模型：宁可报错，不可瞎算
# --------------------------------------------------------------------------- #
def test_placeholder_profile_is_incomplete_and_says_why() -> None:
    with pytest.raises(IncompleteVehicleProfile) as exc:
        load_vehicle()
    msg = str(exc.value)
    assert "缺失" in msg
    assert "energy_per_meter_wh" in msg
    assert "学生 A" in msg


def _toy_profile() -> VehicleProfile:
    """合成参数，只用于验证公式，不是任何真实机型。"""
    return VehicleProfile(
        vehicle_key="toy",
        max_payload_kg=1.0,
        cruise_speed_mps=10.0,
        climb_rate_mps=2.0,
        energy_per_meter_wh=0.02,
        energy_per_second_hover_wh=0.5,
        usable_battery_wh=100.0,
        reserve_policy_wh=20.0,
    )


def test_leg_energy_is_cruise_plus_climb() -> None:
    p = _toy_profile()
    assert cruise_energy_wh(p, 1000.0) == pytest.approx(20.0)
    assert climb_energy_wh(p, 100.0) == pytest.approx(0.5 * 50.0)
    assert climb_energy_wh(p, -10.0) == 0.0
    assert leg_energy_wh(p, 1000.0, 100.0) == pytest.approx(20.0 + 25.0)


def test_max_range_respects_energy() -> None:
    p = _toy_profile()
    assert max_range_m(p, 80.0) == pytest.approx(4000.0)
    with pytest.raises(ValueError):
        max_range_m(p, -1.0)
