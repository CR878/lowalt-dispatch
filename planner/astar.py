"""A* 基线（`astar_static`）。

这一版**只做几何可达**：避开建筑和"起飞时已知"的限制区，找一条最短路径。
不听时间、不算能量、不考虑备降——那些是后续 `diversion` 版本的事。

故意保持"笨"：它是基线 1，用来证明后面加的东西确实改变了结果。
基线如果自己就很聪明，消融实验就没有说服力了。

用法：
    python -m planner.astar                # 跑全部 20 个场景，打印对照表
    python -m planner.astar S2-01          # 只跑一个
"""

from __future__ import annotations

import heapq
import itertools
import math
import time
from dataclasses import dataclass, field

from core.geometry import polyline_length
from planner.grid import DEFAULT_CLEARANCE_M, DEFAULT_RES_M, Grid, build_grid, snap_to_free
from planner.scene import endpoint_xy, load_scene, load_suite, zones_known_at_t0

SQRT2 = math.sqrt(2.0)
NEIGHBORS = (
    (-1, 0, 1.0),
    (1, 0, 1.0),
    (0, -1, 1.0),
    (0, 1, 1.0),
    (-1, -1, SQRT2),
    (-1, 1, SQRT2),
    (1, -1, SQRT2),
    (1, 1, SQRT2),
)


@dataclass
class PathResult:
    found: bool
    waypoints: list[tuple[float, float]] = field(default_factory=list)
    length_m: float = 0.0
    nodes_expanded: int = 0
    elapsed_ms: float = 0.0
    reason: str | None = None
    snapped: bool = False


def _heuristic(dy: int, dx: int, res_m: float) -> float:
    """八邻域的可采纳启发：octile 距离。"""
    ady, adx = abs(dy), abs(dx)
    return res_m * ((ady + adx) + (SQRT2 - 2.0) * min(ady, adx))


def plan(
    grid: Grid,
    start_xy: tuple[float, float],
    goal_xy: tuple[float, float],
    *,
    max_expand: int = 500_000,
) -> PathResult:
    t0 = time.perf_counter()

    def done(**kw) -> PathResult:
        return PathResult(elapsed_ms=(time.perf_counter() - t0) * 1000.0, **kw)

    s = snap_to_free(grid, *start_xy)
    g = snap_to_free(grid, *goal_xy)
    if s is None:
        return done(found=False, reason="起点周围没有可用单元（可能整块被障碍或限制区覆盖）")
    if g is None:
        return done(found=False, reason="终点周围没有可用单元（目的地可能在限制区内）")
    snapped = s != grid.to_ij(*start_xy) or g != grid.to_ij(*goal_xy)

    if s == g:
        return done(found=True, waypoints=[start_xy, goal_xy], length_m=polyline_length([start_xy, goal_xy]), snapped=snapped)

    counter = itertools.count()
    open_heap: list[tuple[float, float, int, int, int]] = [(0.0, 0.0, next(counter), s[0], s[1])]
    g_score: dict[tuple[int, int], float] = {s: 0.0}
    parent: dict[tuple[int, int], tuple[int, int]] = {}
    closed: set[tuple[int, int]] = set()
    expanded = 0

    while open_heap:
        _, cost, _, iy, ix = heapq.heappop(open_heap)
        node = (iy, ix)
        if node in closed:
            continue
        closed.add(node)
        expanded += 1

        if node == g:
            cells = [node]
            while cells[-1] in parent:
                cells.append(parent[cells[-1]])
            cells.reverse()
            pts = [grid.center(*c) for c in cells]
            pts[0] = start_xy
            pts[-1] = goal_xy
            return done(
                found=True, waypoints=pts, length_m=polyline_length(pts),
                nodes_expanded=expanded, snapped=snapped,
            )

        if expanded >= max_expand:
            return done(found=False, nodes_expanded=expanded,
                        reason=f"超出扩展上限 {max_expand} 个节点，放弃")

        for dy, dx, step in NEIGHBORS:
            ny, nx = iy + dy, ix + dx
            if not grid.free(ny, nx):
                continue
            if dy and dx:
                # 禁止切角：对角移动要求两个正交邻格也可用。
                # 否则两个单元中心之间的直线会擦着障碍拐角过去，
                # 栅格里看着"没碰"，连续几何里已经侵入净空。
                if not grid.free(iy + dy, ix) or not grid.free(iy, ix + dx):
                    continue
            nxt = (ny, nx)
            if nxt in closed:
                continue
            tentative = cost + step
            if tentative < g_score.get(nxt, math.inf):
                g_score[nxt] = tentative
                parent[nxt] = node
                f = tentative + _heuristic(g[0] - ny, g[1] - nx, grid.res_m)
                heapq.heappush(open_heap, (f, tentative, next(counter), ny, nx))

    return done(found=False, nodes_expanded=expanded, reason="搜索空间耗尽，无可行路线")


# --------------------------------------------------------------------------- #
# 场景级封装：给一个场景，产出基线路线
# --------------------------------------------------------------------------- #
def plan_scenario(
    scenario: dict,
    scene,
    *,
    res_m: float = DEFAULT_RES_M,
    clearance_m: float = DEFAULT_CLEARANCE_M,
) -> tuple[PathResult, Grid]:
    blockers = list(scene.obstacles) + [z.polygon for z in zones_known_at_t0(scenario, scene)]
    grid = build_grid(blockers, res_m=res_m, clearance_m=clearance_m)
    start = endpoint_xy(scenario, "origin")
    goal = endpoint_xy(scenario, "destination")
    return plan(grid, start, goal), grid


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    import sys

    args = argv if argv is not None else sys.argv[1:]
    wanted = set(args) if args else None

    scene = load_scene()
    suite = load_suite()

    print("=" * 78)
    print("  A* 基线（astar_static）—— 仅几何可达：避建筑 + 避开起飞时已知的限制区")
    print("  不判时限、不算能量、不考虑备降。这些由后续版本加。")
    print("=" * 78)
    header = f"{'场景':<9}{'找到':>6}{'航程m':>9}{'直线m':>9}{'绕行':>8}{'扩展':>8}{'耗时ms':>8}  说明"
    print(header)
    print("-" * 78)

    n_found = 0
    total = 0
    for sc in suite["scenarios"]:
        if wanted is not None and sc["id"] not in wanted:
            continue
        total += 1
        res, _grid = plan_scenario(sc, scene)
        sx, sy = endpoint_xy(sc, "origin")
        gx, gy = endpoint_xy(sc, "destination")
        straight = math.hypot(gx - sx, gy - sy)
        if res.found:
            n_found += 1
            detour = res.length_m / straight - 1.0 if straight > 0 else 0.0
            print(
                f"{sc['id']:<9}{'是':>6}{res.length_m:>9.0f}{straight:>9.0f}"
                f"{detour * 100:>7.0f}%{res.nodes_expanded:>8}{res.elapsed_ms:>8.0f}  —"
            )
        else:
            print(f"{sc['id']:<9}{'否':>6}{'-':>9}{straight:>9.0f}{'-':>8}"
                  f"{res.nodes_expanded:>8}{res.elapsed_ms:>8.0f}  {res.reason}")

    print("-" * 78)
    print(f"找到路线 {n_found}/{total}")
    print("\n注意：S4-02（时限 90 s）与 S4-03（备降点全关）在本版本仍会返回路线——")
    print("      基线不认识时间和备降，这正是后续版本要补的缺口，不是 bug。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
