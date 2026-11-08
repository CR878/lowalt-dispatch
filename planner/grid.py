"""把几何场景栅格化成占用图。

栅格化必然有精度损失，这里把它显式写出来，而不是假装没有：
- 单元边长 `res_m`（默认 10 m）：小于一格的缝隙会被抹掉；
- 安全净空 `clearance_m`（默认 20 m）：按圆形结构元把障碍加厚，
  即"机体中心必须离障碍至少这么远"，近似为方形膨胀，角部略保守。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from core.geometry import Polygon, dilate_circular, polygon_mask

DEFAULT_RES_M = 10.0
DEFAULT_CLEARANCE_M = 20.0


@dataclass
class Grid:
    res_m: float
    x0: float
    y0: float
    clearance_m: float
    blocked: np.ndarray  # shape (ny, nx)，blocked[iy, ix]

    @property
    def nx(self) -> int:
        return self.blocked.shape[1]

    @property
    def ny(self) -> int:
        return self.blocked.shape[0]

    def to_ij(self, x: float, y: float) -> tuple[int, int]:
        return int((y - self.y0) // self.res_m), int((x - self.x0) // self.res_m)

    def center(self, iy: int, ix: int) -> tuple[float, float]:
        return self.x0 + (ix + 0.5) * self.res_m, self.y0 + (iy + 0.5) * self.res_m

    def in_bounds(self, iy: int, ix: int) -> bool:
        return 0 <= iy < self.ny and 0 <= ix < self.nx

    def free(self, iy: int, ix: int) -> bool:
        return self.in_bounds(iy, ix) and not self.blocked[iy, ix]

    @property
    def blocked_ratio(self) -> float:
        return float(self.blocked.mean())

    def summary(self) -> str:
        return (
            f"{self.nx}×{self.ny} 格 @ {self.res_m:.0f} m，"
            f"净空 {self.clearance_m:.0f} m，占用 {self.blocked_ratio * 100:.1f}%"
        )


def build_grid(
    blockers: list[Polygon],
    *,
    x0: float = 0.0,
    y0: float = 0.0,
    x1: float = 3000.0,
    y1: float = 3000.0,
    res_m: float = DEFAULT_RES_M,
    clearance_m: float = DEFAULT_CLEARANCE_M,
) -> Grid:
    """blockers 里的所有多边形都会被视为不可穿越，并按 clearance_m 加厚。"""
    if res_m <= 0:
        raise ValueError("res_m 必须为正")

    nx = int(round((x1 - x0) / res_m))
    ny = int(round((y1 - y0) / res_m))
    if nx <= 0 or ny <= 0:
        raise ValueError("栅格尺寸非法")

    xs = x0 + (np.arange(nx) + 0.5) * res_m
    ys = y0 + (np.arange(ny) + 0.5) * res_m
    xg, yg = np.meshgrid(xs, ys)  # 形状 (ny, nx)

    raw = np.zeros((ny, nx), dtype=bool)
    for poly in blockers:
        raw |= polygon_mask(xg, yg, poly)

    radius_cells = int(np.ceil(clearance_m / res_m))
    blocked = dilate_circular(raw, radius_cells) if blockers else raw

    return Grid(res_m=res_m, x0=x0, y0=y0, clearance_m=clearance_m, blocked=blocked)


def snap_to_free(grid: Grid, x: float, y: float, max_rings: int = 4) -> tuple[int, int] | None:
    """端点落在被加厚的障碍里时，就近找一格可用单元。

    返回 None 表示附近确实没有可用位置——这时应该报错而不是硬凑，
    因为"起点在障碍里"通常意味着场景数据本身有问题。
    """
    iy, ix = grid.to_ij(x, y)
    if grid.free(iy, ix):
        return iy, ix
    for r in range(1, max_rings + 1):
        best: tuple[float, int, int] | None = None
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if max(abs(dy), abs(dx)) != r:
                    continue
                cy, cx = iy + dy, ix + dx
                if not grid.free(cy, cx):
                    continue
                d = dy * dy + dx * dx
                if best is None or d < best[0]:
                    best = (d, cy, cx)
        if best is not None:
            return best[1], best[2]
    return None
