import { test, expect } from "./fixtures";
import {
  airspaceExample,
  airspaceTiming,
  parseAirspaces,
  regionPoints,
} from "../src/navigation/airspace";

function example() {
  return structuredClone(airspaceExample);
}
test("airspace import preserves source and geometry without treating manufacturer data as permission", () => {
  const data = example();
  const [r] = parseAirspaces(data);
  expect(r.source_kind).toBe("team");
  expect(r.is_simulated).toBe(true);
  expect(airspaceTiming(r)).toBe("时效待核实");
  expect(regionPoints(r)).toHaveLength(5);
  expect(() => parseAirspaces({ ...data, coordinate_system: "GCJ02" })).toThrow(
    /WGS84/,
  );
  expect(() =>
    parseAirspaces({ ...data, features: [...data.features, ...data.features] }),
  ).toThrow(/id/);
  data.features[0].geometry.coordinates[0][0][0] = 200;
  expect(() => parseAirspaces(data)).toThrow(/经纬度/);
});

test("airspace validity and height datums are explicit and malformed geometry is rejected", () => {
  const data = example() as unknown as {
    features: {
      properties: Record<string, unknown>;
      geometry: { coordinates: number[][][] };
    }[];
  };
  data.features[0].properties.max_height_m = 80;
  expect(() => parseAirspaces(data)).toThrow(/altitude_ref/);
  data.features[0].properties.altitude_ref = "agl";
  data.features[0].properties.effective_from = "2026-11-16T00:00:00Z";
  data.features[0].properties.effective_until = "2026-11-16T08:00:00Z";
  const r = parseAirspaces(data)[0];
  expect(airspaceTiming(r, Date.parse("2026-11-15T23:00:00Z"))).toContain(
    "未到",
  );
  expect(airspaceTiming(r, Date.parse("2026-11-16T04:00:00Z"))).toContain(
    "时段内",
  );
  expect(airspaceTiming(r, Date.parse("2026-11-16T08:00:00Z"))).toContain(
    "已过",
  );
  data.features[0].geometry.coordinates[0].pop();
  expect(() => parseAirspaces(data)).toThrow(/闭合/);
});

test("seven categories show loaded counts; filters and details stay connected to map markers", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": "#edf3f8" },
          },
        ],
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/airspace?navigation=1");
  const nav = page.getByRole("region", { name: "无人机导航工作区" });
  await nav.getByRole("button", { name: "空域图层", exact: true }).click();
  const areas = nav.getByRole("region", { name: "空域区域图层管理" });
  await expect(areas.locator(".nav-region-filters button")).toHaveCount(7);
  await expect(areas).toContainText("尚未载入区域边界");
  await expect(
    page.getByRole("complementary", { name: "空域分类图例" }),
  ).toContainText("数据未接入");
  await areas.locator('input[type="file"]').setInputFiles({
    name: "airspaces.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify(airspaceExample)),
  });
  await expect(areas.locator(".nav-region-list button")).toHaveCount(1);
  await expect(areas.locator(".nav-region-detail")).toContainText("时效待核实");
  await expect(page.locator(".geo-airspace-label")).toHaveCount(1);
  await expect(page.locator(".geo-airspace-label")).toContainText("演练");
  const filter = areas
    .locator(".nav-region-filters button")
    .filter({ hasText: /^警示区/ });
  await filter.click();
  await expect(page.locator(".geo-airspace-label")).toHaveCount(0);
  await areas.getByRole("button", { name: "定位该区域", exact: true }).click();
  await expect(page.locator(".geo-airspace-label")).toHaveCount(1);
  await areas.locator('input[type="file"]').setInputFiles({
    name: "invalid.geojson",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ ...airspaceExample, coordinate_system: "GCJ02" }),
    ),
  });
  await expect(areas.locator(".nav-error")).toContainText("WGS84");
  await expect(page.locator(".geo-airspace-label")).toHaveCount(1);
  await nav.getByRole("button", { name: "航线与方案", exact: true }).click();
  await page.locator(".geo-airspace-label").click();
  await expect(areas).toBeVisible();
  await page.getByRole("button", { name: "切换到夜间模式" }).click();
  await expect(page.locator(".geo-airspace-label")).toHaveCount(1);
  await page
    .getByRole("complementary", { name: "空域分类图例" })
    .getByRole("button", { name: /空域图例/ })
    .click();
  await page.screenshot({
    path: "test-results/airspace-night.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
