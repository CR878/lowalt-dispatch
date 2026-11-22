import { test, expect } from "@playwright/test";
import {
  guide,
  liveRouteProblem,
  liveSample,
  navigationAlerts,
  parseRoutes,
  routeMetrics,
  sampleAlong,
  terrainAhead,
  type NavSample,
} from "../src/navigation/engine";

const record = {
  id: "test-route",
  title: "测试航路",
  source: "unit fixture",
  frame: "ENU",
  altitude_ref: "rel_takeoff",
  is_simulated: true,
  task_id: "test-task",
  plan_version: "v1",
  waypoints: [
    { x: 0, y: 0, altitude: 100 },
    { x: 100, y: 0, altitude: 120 },
    { x: 100, y: 100, altitude: 120 },
  ],
};
const route = parseRoutes(record)[0];
const sample: NavSample = {
  point: { x: 50, y: 10, altitude: 90, label: "当前位置" },
  frame: "ENU",
  altitude_ref: "rel_takeoff",
  speed: 10,
  heading: 90,
  battery: 10,
};
test("guidance measures actual polyline projection, turns and arrival without fabricating ETA", () => {
  const g = guide(route, sample)!;
  expect(g.total).toBe(200);
  expect(g.along).toBe(50);
  expect(g.remaining).toBe(150);
  expect(g.crossTrack).toBe(10);
  expect(g.turn).toBe(-90);
  expect(g.altitudeDelta).toBe(30);
  expect(g.arrived).toBe(false);
  expect(guide(route, { ...sample, speed: 0 })?.eta).toBeNull();
  expect(
    guide(route, { ...sample, altitude_ref: "amsl" })?.altitudeDelta,
  ).toBeNull();
  expect(guide(route, { ...sample, point: route.waypoints[2] })?.arrived).toBe(
    true,
  );
  expect(
    guide(route, { ...sample, point: route.waypoints[1] })?.nextIndex,
  ).toBe(2);
  expect(sampleAlong(route, 0.75)).toMatchObject({
    x: 100,
    y: 50,
    altitude: 120,
  });
});
test("parser normalizes NED axes, preserves WGS84 and rejects ambiguous coordinate or altitude data", () => {
  expect(
    parseRoutes({ ...record, frame: "NED" })[0].waypoints[1],
  ).toMatchObject({ x: 0, y: 100 });
  const wgs = parseRoutes({
    ...record,
    frame: "WGS84",
    waypoints: [
      { x: 121.4737, y: 31.2304 },
      { x: 121.4747, y: 31.2304 },
    ],
  })[0];
  expect(wgs.waypoints[0].x).toBe(121.4737);
  expect(wgs.display_anchor).toBeNull();
  expect(routeMetrics(wgs).length).toBeGreaterThan(90);
  expect(() => parseRoutes({ ...record, frame: "GCJ02" })).toThrow();
  expect(() => parseRoutes({ ...record, altitude_ref: null })).toThrow(/高度/);
  expect(() =>
    parseRoutes({
      ...record,
      waypoints: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    }),
  ).toThrow(/重复/);
  expect(() =>
    parseRoutes({
      ...record,
      frame: "WGS84",
      waypoints: [
        { x: 181, y: 30 },
        { x: 182, y: 31 },
      ],
    }),
  ).toThrow(/范围/);
  expect(() => parseRoutes({ routes: [record, record] })).toThrow(/id/);
  expect(() =>
    parseRoutes({
      ...record,
      frame: "WGS84",
      waypoints: [
        { x: 179.99, y: 0 },
        { x: -179.99, y: 0 },
      ],
    }),
  ).toThrow(/180/);
  const change = {
    revision: 1,
    count: 1,
    maxDelta: 5,
    source: "test DEM",
    capturedAt: new Date().toISOString(),
    bounds: { minX: 90, maxX: 110, minY: 40, maxY: 60 },
  };
  const projected = guide(route, sample)!;
  expect(
    terrainAhead({ ...route, display_anchor: "demo" }, projected, change),
  ).toBe(true);
  expect(terrainAhead(route, projected, change)).toBe(false);
  expect(
    terrainAhead({ ...route, display_anchor: "demo" }, projected, {
      ...change,
      bounds: { minX: 200, maxX: 210, minY: 200, maxY: 210 },
    }),
  ).toBe(false);
});
test("live guidance pauses on stale data, mismatched task/version or source type", () => {
  const f = {
    source: "test:m4",
    captured_at: new Date().toISOString(),
    is_simulated: true,
    task_id: "test-task",
    plan_version: "v1",
    position: { frame: "NED" as const, x_m: 10, y_m: 50, z_m: -90 },
    altitude: 90,
    altitude_ref: "rel_takeoff" as const,
    speed: 10,
    heading: 90,
    battery: 10,
    voltage: null,
    current: null,
    energyWh: null,
    climb: null,
    pitch: null,
    roll: null,
    in_air: true,
    flight_mode: null,
    gps_fix: null,
  };
  expect(liveSample(f)?.point).toMatchObject({ x: 50, y: 10, altitude: 90 });
  expect(liveRouteProblem(route, f, "live")).toBeNull();
  expect(liveRouteProblem(route, f, "stale")).toContain("过期");
  expect(
    liveRouteProblem(route, { ...f, plan_version: "v2" }, "live"),
  ).toContain("版本不匹配");
  expect(
    liveRouteProblem(route, { ...f, is_simulated: false }, "live"),
  ).toContain("来源不匹配");
  expect(
    liveRouteProblem(
      route,
      { ...f, position: { frame: "WGS84", lon_deg: 121, lat_deg: 31 } },
      "live",
    ),
  ).toContain("坐标系不匹配");
  const alerts = navigationAlerts(
    sample,
    guide(route, { ...sample, point: { ...sample.point, y: 90 } }),
    20,
    25,
  );
  expect(alerts.find((a) => a.id === "battery")?.severity).toBe("critical");
  expect(navigationAlerts(null, null, 20, 25)).toEqual([]);
});
