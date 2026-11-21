import type { Point, TerrainChange, TerrainPatch } from "./types";

export const TERRAIN_SIZE = 3000;
export const GRID = 90;
export const GRID_STEP = TERRAIN_SIZE / GRID;

export function baseHeight(x: number, y: number): number {
  const mountain =
    185 * Math.exp(-((x - 2750) ** 2 / 410000 + (y - 2620) ** 2 / 230000));
  const hill =
    95 * Math.exp(-((x - 260) ** 2 / 220000 + (y - 2600) ** 2 / 290000));
  const ripple = 3.5 * Math.sin(x / 260) * Math.cos(y / 300);
  return 7 + mountain + hill + ripple;
}

export class TerrainModel {
  readonly heights = new Float32Array((GRID + 1) ** 2);
  revision = 0;
  changedIndices = new Set<number>();
  changeBounds: TerrainChange["bounds"] = null;
  constructor() {
    for (let y = 0; y <= GRID; y++)
      for (let x = 0; x <= GRID; x++) {
        this.heights[y * (GRID + 1) + x] = baseHeight(
          x * GRID_STEP,
          y * GRID_STEP,
        );
      }
  }
  heightAt(x: number, y: number): number {
    const gx = Math.max(0, Math.min(GRID - 0.00001, x / GRID_STEP));
    const gy = Math.max(0, Math.min(GRID - 0.00001, y / GRID_STEP));
    const ix = Math.floor(gx),
      iy = Math.floor(gy),
      fx = gx - ix,
      fy = gy - iy;
    const at = (dx: number, dy: number) =>
      this.heights[(iy + dy) * (GRID + 1) + ix + dx];
    return (
      at(0, 0) * (1 - fx) * (1 - fy) +
      at(1, 0) * fx * (1 - fy) +
      at(0, 1) * (1 - fx) * fy +
      at(1, 1) * fx * fy
    );
  }
  apply(patch: TerrainPatch, threshold = 2): TerrainChange {
    if (!patch || typeof patch !== "object")
      throw new Error("地形补丁格式不合法");
    if (!Number.isInteger(patch.revision) || patch.revision <= this.revision)
      throw new Error("地形版本必须递增");
    if (
      typeof patch.source !== "string" ||
      !patch.source.trim() ||
      patch.source.length > 200 ||
      typeof patch.capturedAt !== "string" ||
      !Number.isFinite(Date.parse(patch.capturedAt))
    )
      throw new Error("地形数据缺少来源或时间");
    if (
      !Array.isArray(patch.cells) ||
      !patch.cells.length ||
      patch.cells.length > (GRID + 1) ** 2
    )
      throw new Error("地形数据尺寸不合法");
    if (patch.mode !== undefined && !["baseline", "delta"].includes(patch.mode))
      throw new Error("地形更新模式不合法");
    if (patch.mode === "baseline" && patch.cells.length !== (GRID + 1) ** 2)
      throw new Error("地形基准必须包含完整的91×91网格");
    const indices = new Set<number>();
    // Validate the complete patch before changing any height.
    for (const cell of patch.cells) {
      if (
        !cell ||
        !Number.isInteger(cell.x) ||
        !Number.isInteger(cell.y) ||
        cell.x < 0 ||
        cell.x > GRID ||
        cell.y < 0 ||
        cell.y > GRID ||
        !Number.isFinite(cell.height) ||
        Math.abs(cell.height) > 10000
      )
        throw new Error("地形网格或高度不合法");
      const index = cell.y * (GRID + 1) + cell.x;
      if (indices.has(index)) throw new Error("地形网格重复");
      indices.add(index);
    }
    let count = 0,
      maxDelta = 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    this.changedIndices = new Set();
    this.changeBounds = null;
    for (const cell of patch.cells) {
      const index = cell.y * (GRID + 1) + cell.x;
      const delta =
        patch.mode === "baseline"
          ? 0
          : Math.abs(cell.height - this.heights[index]);
      if (delta >= threshold) {
        count++;
        this.changedIndices.add(index);
        const x = cell.x * GRID_STEP,
          y = cell.y * GRID_STEP;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      maxDelta = Math.max(maxDelta, delta);
      this.heights[index] = cell.height;
    }
    this.revision = patch.revision;
    this.changeBounds = count ? { minX, minY, maxX, maxY } : null;
    return {
      revision: patch.revision,
      count,
      maxDelta,
      source: patch.source,
      capturedAt: patch.capturedAt,
      bounds: this.changeBounds,
    };
  }
}

export function demoPatch(revision: number): TerrainPatch {
  const cells: TerrainPatch["cells"] = [];
  for (let y = 52; y <= 63; y++)
    for (let x = 63; x <= 74; x++) {
      const bulge =
        26 *
        Math.exp(-((x - 68) ** 2 + (y - 57) ** 2) / 20) *
        (revision % 2 ? 1 : 0.4);
      cells.push({
        x,
        y,
        height: baseHeight(x * GRID_STEP, y * GRID_STEP) + bulge,
      });
    }
  return {
    revision,
    source: "DEMO · 合成DEM增量",
    capturedAt: new Date().toISOString(),
    cells,
  };
}

export function pointAlong(route: Point[], progress: number): Point {
  if (route.length === 0) return [1500, 1500];
  if (route.length === 1) return route[0];
  const lengths = route
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  let left = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      const f = lengths[i] ? left / lengths[i] : 0;
      return [
        route[i][0] + (route[i + 1][0] - route[i][0]) * f,
        route[i][1] + (route[i + 1][1] - route[i][1]) * f,
      ];
    }
    left -= lengths[i];
  }
  return route[route.length - 1];
}
