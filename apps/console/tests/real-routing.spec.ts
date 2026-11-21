import { test, expect } from "./fixtures";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

test("intake loads computed WGS84 polyline with provenance and explicit missing weather", async ({
  page,
}) => {
  // These are browser-adapter fixtures, deliberately not live data evidence.
  await page.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#101c2d" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/assistant/intakes/real-routing-test", (r) =>
    r.fulfill({
      json: {
        origin: { name: "测试起点", point: [121.46, 31.22], crs: "EPSG:4326" },
        destination: {
          name: "测试终点",
          point: [121.48, 31.22],
          crs: "EPSG:4326",
        },
        scheduled_for: "2026-11-18T09:00:00+08:00",
      },
    }),
  );
  let calls = 0,
    flightCalls = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/dispatch\//.test(request.url()))
      flightCalls++;
  });
  await page.route("**/api/assistant/navigation/candidates", (r) => {
    const input = r.request().postDataJSON();
    expect(input.frame).toBe("WGS84");
    expect(input.origin).toEqual({ lng: 121.46, lat: 31.22 });
    expect(input.scheduled_for).toBe("2026-11-18T09:00:00+08:00");
    calls++;
    return r.fulfill({
      json: {
        status: "ok",
        scene_id: "f".repeat(16),
        clearance_m: 20,
        grid_clearance_m: 48.3,
        resolution_m: 20,
        elapsed_ms: 12,
        obstacle_source: "OSM adapter test fixture",
        weather_source: "Open-Meteo adapter test fixture",
        data: {},
        warnings: ["高度估算不代表实测", "空域须人工核对"],
        limitation: "仅水平几何参考",
        alternatives: [{ reason: null }],
        dispatch_enabled: false,
        weather: { status: "unavailable", energy: { status: "unavailable" } },
        route: {
          id: "test-real",
          title: "测试建筑避障路线",
          source: "adapter test fixture",
          frame: "WGS84",
          altitude_ref: null,
          is_simulated: false,
          task_id: null,
          plan_version: null,
          waypoints: [
            { x: 121.46, y: 31.22 },
            { x: 121.47, y: 31.222 },
            { x: 121.48, y: 31.22 },
          ],
        },
      },
    });
  });
  await page.route("**/api/assistant/navigation/scenes/*", (r) =>
    r.fulfill({
      json: {
        obstacles: { type: "FeatureCollection", features: [] },
        roads: { type: "FeatureCollection", features: [] },
      },
    }),
  );
  await page.goto("/airspace?intake=real-routing-test");
  const panel = page.getByTestId("real-routing");
  await expect(panel).toContainText("3 个 WGS84 航点");
  await expect(panel).toContainText("缺少有效数据，未计算");
  await panel.getByText("数据来源与限制").click();
  await expect(panel).toContainText("OSM adapter test fixture");
  await expect(panel).toContainText("空域须人工核对");
  await expect(
    panel.getByRole("button", { name: "导出航点与来源 JSON" }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(flightCalls).toBe(0);
  const schedule = panel.getByLabel("真实航线起飞时刻");
  const queriedSchedule = await schedule.inputValue();
  await schedule.fill("");
  await expect(panel.getByRole("alert")).toContainText("起飞时刻已更改");
  await schedule.fill(queriedSchedule);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await schedule.fill("2026-11-19T10:00");
  await expect(panel.getByRole("alert")).toContainText("起飞时刻已更改");
});

test("upstream failure leaves explicit unavailable state without a fake route", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "aeris-geo-mission-v1",
      JSON.stringify({
        origin: {
          name: "测试A",
          point: [121.46, 31.22],
          source: "map_click",
          capturedAt: new Date().toISOString(),
        },
        destination: {
          name: "测试B",
          point: [121.48, 31.22],
          source: "map_click",
          capturedAt: new Date().toISOString(),
        },
      }),
    ),
  );
  await page.route("**/api/assistant/navigation/candidates", (r) =>
    r.fulfill({
      status: 503,
      json: { detail: { reason: "OSM 服务不可达，未回退到仿真数据" } },
    }),
  );
  await page.goto("/airspace");
  const panel = page.getByTestId("real-routing");
  await panel.getByRole("button", { name: "计算真实避障航线" }).click();
  await expect(panel.getByRole("alert")).toContainText("未回退到仿真数据");
  await expect(
    panel.getByRole("button", { name: "导出航点与来源 JSON" }),
  ).toHaveCount(0);
});

test("live OSM airport route renders real buildings and roads without demo instruments", async ({
  page,
}) => {
  test.skip(
    !process.env.AERIS_REAL_DATA_CHECK,
    "Opt-in live integration check; requires real upstream/cache data",
  );
  test.setTimeout(240_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      "aeris-geo-mission-v1",
      JSON.stringify({
        origin: {
          name: "上海虹桥国际机场",
          point: [121.335209, 31.19795],
          source: "coordinates",
          capturedAt: new Date().toISOString(),
        },
        destination: {
          name: "上海浦东国际机场",
          point: [121.8044, 31.144383],
          source: "coordinates",
          capturedAt: new Date().toISOString(),
        },
      }),
    ),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/airspace");
  const panel = page.getByTestId("real-routing");
  const resultPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/assistant/navigation/candidates") &&
      response.request().method() === "POST",
    { timeout: 160_000 },
  );
  const scenePromise = page
    .waitForResponse(
      (response) =>
        /\/api\/assistant\/navigation\/scenes\/[a-f0-9]{16}$/.test(
          response.url(),
        ),
      { timeout: 170_000 },
    )
    .catch(() => null);
  await panel.getByRole("button", { name: "计算真实避障航线" }).click();
  const response = await resultPromise;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.route, result.alternatives[0]?.reason).not.toBeNull();
  writeFileSync(
    resolve("../../results/real_navigation_api_probe.json"),
    JSON.stringify(
      {
        ...result,
        verification_source:
          "Actual authenticated browser request; no navigation/scene API fixtures",
        verified_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  expect(result.route.frame).toBe("WGS84");
  expect(result.route.waypoints.length).toBeGreaterThan(2);
  expect(result.continuous_clearance_verified).toBe(true);
  expect(result.dispatch_enabled).toBe(false);
  expect(result.data.building_count).toBeGreaterThan(0);
  expect(result.data.road_count).toBeGreaterThan(0);
  const sceneResponse = await scenePromise;
  expect(sceneResponse).not.toBeNull();
  expect(sceneResponse!.ok()).toBeTruthy();
  // The full genuine snapshot can exceed Chrome's inspector body cache.
  // The app consumes it normally; avoid asking CDP to retain a second copy.
  expect(Number(sceneResponse!.headers()["content-length"])).toBeGreaterThan(
    1000,
  );
  await expect(panel).toContainText(`${result.data.building_count} 栋建筑`);
  await expect(panel).toContainText(
    `${result.route.waypoints.length} 个 WGS84 航点`,
  );
  await expect(
    panel.getByRole("button", { name: "计算真实避障航线" }),
  ).toBeEnabled({ timeout: 20_000 });
  const realMap = page.locator(".geo-map");
  await expect(
    realMap,
    "The genuine building and road sources must finish worker tiling and render visible GPU layers before capture",
  ).toHaveAttribute("data-real-scene-status", "ready", { timeout: 90_000 });
  const renderedFeatures = await realMap.evaluate((node) => ({
    buildings: Number((node as HTMLElement).dataset.realBuildingsRendered),
    roads: Number((node as HTMLElement).dataset.realRoadsRendered),
  }));
  expect(renderedFeatures.buildings).toBeGreaterThan(0);
  expect(renderedFeatures.roads).toBeGreaterThan(0);
  await expect(page.locator(".telemetry-panel")).toHaveCount(0);
  await expect(page.locator(".mission-card")).toHaveCount(0);
  await expect(page.locator(".geo-pin.origin")).toBeVisible();
  await expect(page.locator(".geo-pin.destination")).toBeVisible();
  const workspaceWidth = await page
    .locator(".workspace")
    .evaluate((node) => node.getBoundingClientRect().width);
  const mapWidth = await page
    .locator(".map-panel")
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(mapWidth).toBeGreaterThan(workspaceWidth - 5);
  const rendering = await page.locator(".geo-map").evaluate((node) => {
    const canvas = node.querySelector("canvas")!;
    return {
      width: node.clientWidth,
      height: node.clientHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasStyle: canvas.getAttribute("style"),
      ratio: window.devicePixelRatio,
    };
  });
  expect(rendering.canvasWidth / rendering.ratio).toBeCloseTo(
    rendering.width,
    0,
  );
  await page.screenshot({
    path: resolve("../../results/real_route_console.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
