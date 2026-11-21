import { distanceMeters, validLngLat, type LngLat } from "../geo";
import type { LiveTelemetry, Point, TerrainChange } from "../types";
import type { AirspaceRegion } from "./airspace";

export type AltitudeRef = "amsl" | "agl" | "rel_takeoff";
export type NavPoint = {
  x: number;
  y: number;
  altitude: number | null;
  label: string;
};
export type NavRoute = {
  id: string;
  title: string;
  frame: "WGS84" | "ENU";
  altitude_ref: AltitudeRef | null;
  waypoints: NavPoint[];
  source: string;
  task_id: string | null;
  plan_version: string | null;
  is_simulated: boolean;
  display_anchor: "demo" | null;
};
export type NavSample = {
  point: NavPoint;
  frame: NavRoute["frame"];
  altitude_ref: AltitudeRef | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
};
export type Guidance = {
  along: number;
  remaining: number;
  total: number;
  crossTrack: number;
  nextIndex: number;
  nextDistance: number;
  bearing: number;
  headingError: number | null;
  altitudeDelta: number | null;
  eta: number | null;
  turn: number;
  arrived: boolean;
  projected: NavPoint;
};
export type NavAlert = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
};
export type NavigationOverlay = {
  regions: AirspaceRegion[];
  selectedRegion: string;
  active: LngLat[];
  comparison: LngLat[];
  flown: LngLat[][];
  aircraft: LngLat | null;
  target: LngLat | null;
  heading: number | null;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const deltaLng = (value: number) => ((value + 540) % 360) - 180;
export function localPoint(point: NavPoint, route: NavRoute): Point {
  if (route.frame === "ENU") return [point.x, point.y];
  const origin = route.waypoints[0];
  return [
    deltaLng(point.x - origin.x) *
      Math.cos((origin.y * Math.PI) / 180) *
      111195.08,
    (point.y - origin.y) * 111195.08,
  ];
}
export function routeDistance(
  a: NavPoint,
  b: NavPoint,
  frame: NavRoute["frame"],
) {
  return frame === "WGS84"
    ? distanceMeters([a.x, a.y], [b.x, b.y])
    : Math.hypot(a.x - b.x, a.y - b.y);
}
export function routeMetrics(route: NavRoute) {
  const legs = route.waypoints
    .slice(1)
    .map((p, i) => routeDistance(route.waypoints[i], p, route.frame));
  const altitudes = route.waypoints.map((p) => p.altitude);
  return {
    legs,
    length: legs.reduce((a, b) => a + b, 0),
    maxAltitude: altitudes.every(finite) ? Math.max(...altitudes) : null,
  };
}
export function sampleAlong(route: NavRoute, fraction: number): NavPoint {
  const { legs, length } = routeMetrics(route);
  let left = Math.max(0, Math.min(1, fraction)) * length;
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i])
      return interpolate(
        route.waypoints[i],
        route.waypoints[i + 1],
        left / Math.max(0.0001, legs[i]),
        route.frame,
      );
    left -= legs[i];
  }
  return route.waypoints.at(-1)!;
}
function interpolate(
  a: NavPoint,
  b: NavPoint,
  t: number,
  frame: NavRoute["frame"],
): NavPoint {
  const x = a.x + (frame === "WGS84" ? deltaLng(b.x - a.x) : b.x - a.x) * t;
  return {
    x: frame === "WGS84" ? deltaLng(x) : x,
    y: a.y + (b.y - a.y) * t,
    altitude:
      a.altitude != null && b.altitude != null
        ? a.altitude + (b.altitude - a.altitude) * t
        : null,
    label: "投影位置",
  };
}
const bearing = (a: Point, b: Point) =>
  ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
export const angleDelta = (target: number, current: number) =>
  ((target - current + 540) % 360) - 180;
export function guide(route: NavRoute, sample: NavSample): Guidance | null {
  if (route.frame !== sample.frame || route.waypoints.length < 2) return null;
  const p = localPoint(sample.point, route),
    xy = route.waypoints.map((v) => localPoint(v, route));
  const { legs, length } = routeMetrics(route);
  let best = Infinity,
    index = 0,
    fraction = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i],
      b = xy[i + 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) /
          Math.max(1e-9, dx * dx + dy * dy),
      ),
    );
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d < best - 0.001) {
      best = d;
      index = i;
      fraction = t;
    }
  }
  // At a passed vertex, guide toward the next segment, not the point behind us.
  if (fraction > 0.999 && index < legs.length - 1) {
    index++;
    fraction = 0;
  }
  const along =
    legs.slice(0, index).reduce((a, b) => a + b, 0) + legs[index] * fraction;
  const next = route.waypoints[index + 1];
  const nextDistance = routeDistance(sample.point, next, route.frame);
  const remaining = Math.max(0, length - along);
  const direction = bearing(p, xy[index + 1]);
  return {
    along,
    remaining,
    total: length,
    crossTrack: best,
    nextIndex: index + 1,
    nextDistance,
    bearing: direction,
    headingError:
      sample.heading == null ? null : angleDelta(direction, sample.heading),
    altitudeDelta:
      next.altitude != null &&
      sample.point.altitude != null &&
      route.altitude_ref != null &&
      route.altitude_ref === sample.altitude_ref
        ? next.altitude - sample.point.altitude
        : null,
    eta:
      sample.speed != null && sample.speed >= 0.5
        ? (remaining + best) / sample.speed
        : null,
    turn:
      index + 2 < xy.length
        ? angleDelta(
            bearing(xy[index + 1], xy[index + 2]),
            bearing(xy[index], xy[index + 1]),
          )
        : 0,
    arrived: remaining <= 12 && nextDistance <= 12 && best <= 12,
    projected: interpolate(route.waypoints[index], next, fraction, route.frame),
  };
}
export function liveSample(frame: LiveTelemetry | null): NavSample | null {
  const p = frame?.position;
  if (!frame || !p) return null;
  let point: NavPoint;
  if (p.frame === "WGS84") {
    if (!validLngLat([p.lon_deg, p.lat_deg])) return null;
    point = {
      x: p.lon_deg,
      y: p.lat_deg,
      altitude: frame.altitude,
      label: "当前位置",
    };
  } else {
    if (![p.x_m, p.y_m, p.z_m].every(finite)) return null;
    point = {
      x: p.frame === "NED" ? p.y_m : p.x_m,
      y: p.frame === "NED" ? p.x_m : p.y_m,
      altitude: frame.altitude,
      label: "当前位置",
    };
  }
  return {
    point,
    frame: p.frame === "WGS84" ? "WGS84" : "ENU",
    altitude_ref: frame.altitude_ref,
    speed: finite(frame.speed) && frame.speed >= 0 ? frame.speed : null,
    heading: finite(frame.heading) ? frame.heading : null,
    battery:
      finite(frame.battery) && frame.battery >= 0 && frame.battery <= 100
        ? frame.battery
        : null,
  };
}
export function liveRouteProblem(
  route: NavRoute | null,
  frame: LiveTelemetry | null,
  status: string,
): string | null {
  if (status !== "live") return "遥测缺失或过期：导航计算已暂停";
  const sample = liveSample(frame);
  if (!sample) return "没有可用位置：等待带坐标系的定位数据";
  if (!route) return "自由观察：导入匹配任务的航线后可显示航点引导";
  if (sample.frame !== route.frame)
    return "坐标系不匹配：局部坐标不会转换为真实经纬度";
  if (
    !route.task_id ||
    !route.plan_version ||
    route.task_id !== frame?.task_id ||
    route.plan_version !== frame?.plan_version
  )
    return "任务或航线版本不匹配：仅作预览，暂停航点引导";
  if (route.is_simulated !== frame.is_simulated)
    return "仿真与真实来源不匹配：暂停航点引导";
  return null;
}
export function navigationAlerts(
  sample: Pick<NavSample, "battery"> | null,
  guidance: Guidance | null,
  deviationM: number,
  lowBattery: number,
): NavAlert[] {
  const alerts: NavAlert[] = [];
  if (sample?.battery != null && sample.battery <= lowBattery)
    alerts.push({
      id: "battery",
      severity: sample.battery <= 15 ? "critical" : "warning",
      title: sample.battery <= 15 ? "电量严重偏低" : "电量低于提醒阈值",
      detail: `当前 ${sample.battery.toFixed(1)}%；没有机型能耗模型，无法据此判定返航可达。`,
    });
  if (guidance && guidance.crossTrack > deviationM)
    alerts.push({
      id: "deviation",
      severity: "warning",
      title: "偏离选定航线",
      detail: `水平偏航 ${guidance.crossTrack.toFixed(0)} m，超过 ${deviationM} m 提醒阈值；请人工核对位置和航线。`,
    });
  if (guidance?.altitudeDelta != null && Math.abs(guidance.altitudeDelta) > 20)
    alerts.push({
      id: "altitude",
      severity: "warning",
      title: "目标高度存在差异",
      detail: `与下一航点相差 ${guidance.altitudeDelta.toFixed(0)} m；同一高度基准，仅提供提示。`,
    });
  return alerts;
}
/** Horizontal overlap only. It must never be labelled terrain collision/clearance. */
export function terrainAhead(
  route: NavRoute,
  guidance: Guidance,
  change: TerrainChange,
): boolean {
  if (
    route.frame !== "ENU" ||
    route.display_anchor !== "demo" ||
    !change.bounds ||
    change.count === 0
  )
    return false;
  const b = change.bounds;
  const points = [
    guidance.projected,
    ...route.waypoints.slice(guidance.nextIndex),
  ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      c = points[i];
    let lo = 0,
      hi = 1;
    for (const [start, delta, min, max] of [
      [a.x, c.x - a.x, b.minX, b.maxX],
      [a.y, c.y - a.y, b.minY, b.maxY],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (start < min || start > max) {
          lo = 2;
          break;
        }
      } else {
        const t1 = (min - start) / delta,
          t2 = (max - start) / delta;
        lo = Math.max(lo, Math.min(t1, t2));
        hi = Math.min(hi, Math.max(t1, t2));
      }
    }
    if (lo <= hi) return true;
  }
  return false;
}
export function parseRoutes(input: unknown): NavRoute[] {
  const records =
    input && typeof input === "object" && "routes" in input
      ? (input as { routes: unknown }).routes
      : [input];
  if (!Array.isArray(records) || records.length < 1 || records.length > 8)
    throw new Error("一次导入1–8条航线");
  const string = (v: unknown, max = 160) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const ids = new Set<string>();
  return records.map((value): NavRoute => {
    if (!value || typeof value !== "object")
      throw new Error("航线必须是JSON对象");
    const r = value as Record<string, unknown>;
    if (
      !string(r.id) ||
      !string(r.title) ||
      !string(r.source) ||
      !["WGS84", "ENU", "NED"].includes(String(r.frame)) ||
      typeof r.is_simulated !== "boolean"
    )
      throw new Error(
        "航线需包含id、title、source、frame（WGS84/ENU/NED）和is_simulated",
      );
    if (ids.has(r.id as string)) throw new Error("同一文件的航线id不能重复");
    ids.add(r.id as string);
    if (
      r.altitude_ref != null &&
      !["amsl", "agl", "rel_takeoff"].includes(String(r.altitude_ref))
    )
      throw new Error("高度基准必须为amsl/agl/rel_takeoff");
    for (const key of ["task_id", "plan_version"])
      if (r[key] != null && !string(r[key]))
        throw new Error("任务和版本标识格式错误");
    if (
      !Array.isArray(r.waypoints) ||
      r.waypoints.length < 2 ||
      r.waypoints.length > 1000
    )
      throw new Error("每条航线需要2–1000个航点");
    const points: NavPoint[] = r.waypoints.map((v, i) => {
      if (!v || typeof v !== "object") throw new Error("航点格式错误");
      const p = v as Record<string, unknown>;
      if (
        !finite(p.x) ||
        !finite(p.y) ||
        (p.altitude != null &&
          (!finite(p.altitude) || Math.abs(p.altitude) > 10000))
      )
        throw new Error("航点坐标或高度不合法");
      if (
        r.frame === "WGS84"
          ? !validLngLat([p.x, p.y])
          : Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000
      )
        throw new Error("坐标超出范围；WGS84按经度、纬度填写");
      if (p.altitude != null && !r.altitude_ref)
        throw new Error(
          "包含高度时必须声明altitude_ref，禁止混用相对高度与海拔",
        );
      if (p.label != null && !string(p.label, 80))
        throw new Error("航点名称需为1–80字符");
      return {
        x: r.frame === "NED" ? p.y : p.x,
        y: r.frame === "NED" ? p.x : p.y,
        altitude: finite(p.altitude) ? p.altitude : null,
        label: typeof p.label === "string" ? p.label : `航点 ${i + 1}`,
      };
    });
    const route: NavRoute = {
      id: r.id as string,
      title: r.title as string,
      source: r.source as string,
      frame: r.frame === "WGS84" ? "WGS84" : "ENU",
      waypoints: points,
      altitude_ref: (r.altitude_ref as AltitudeRef) || null,
      task_id: (r.task_id as string) || null,
      plan_version: (r.plan_version as string) || null,
      is_simulated: r.is_simulated,
      display_anchor: null,
    };
    if (points.some((p) => routeDistance(points[0], p, route.frame) > 100000))
      throw new Error("导航预览限定在100km局部区域内，请分段导入");
    if (
      route.frame === "WGS84" &&
      points.slice(1).some((p, i) => Math.abs(p.x - points[i].x) > 180)
    )
      throw new Error("跨180°经线的航线请分段导入，避免地图连线跨越全球");
    if (
      routeMetrics(route).length < 1 ||
      points
        .slice(1)
        .some((p, i) => routeDistance(points[i], p, route.frame) < 0.1)
    )
      throw new Error("相邻航点重复或航线过短");
    return route;
  });
}
export const altitudeLabel = (ref: AltitudeRef | null) =>
  ref
    ? { amsl: "海拔", agl: "离地", rel_takeoff: "相对起飞点" }[ref]
    : "高度基准未知";
