import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseCoordinates, enuToLngLat, lngLatToEnu } from "../src/geo";

test("coordinates reject invalid ranges and preserve WGS84/ENU distinction", () => {
  expect(parseCoordinates("121.495, 31.241")).toEqual([121.495, 31.241]);
  expect(parseCoordinates("医院")).toBeNull();
  expect(() => parseCoordinates("181, 31")).toThrow("坐标超出范围");
  expect(() => parseCoordinates("121, 91")).toThrow("坐标超出范围");
  const original: [number, number] = [1234, 2345];
  const back = lngLatToEnu(enuToLngLat(original));
  expect(back[0]).toBeCloseTo(original[0], 6);
  expect(back[1]).toBeCloseTo(original[1], 6);
});
async function search(page: Page, query: string) {
  await page.getByRole("textbox", { name: "搜索地点或经纬度" }).fill(query);
  await page.getByRole("button", { name: "搜索地点", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByText("构建数字空域…")).toBeHidden();
});
test("real coordinate endpoints survive reload and are saved and exported with provenance", async ({
  page,
}) => {
  await page.getByRole("button", { name: "地点定位 L" }).click();
  await search(page, "121.495,31.241");
  await page.getByLabel("选中地点名称").fill("真实起点");
  await page.getByRole("button", { name: "设为起点", exact: true }).click();
  await search(page, "121.510,31.252");
  await page.getByLabel("选中地点名称").fill("真实终点");
  await page.getByRole("button", { name: "设为终点", exact: true }).click();
  await expect(page.locator(".geo-pin.destination")).toContainText("真实终点");
  await page.getByRole("button", { name: "用这两个地点创建草稿" }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("真实选点测试");
  await page.getByRole("button", { name: "保存任务草稿" }).click();
  await expect(
    page.locator(".task-card").filter({ hasText: "真实选点测试" }),
  ).toContainText("121.510000");
  await page.reload();
  await expect(page.locator(".geo-pin.destination")).toContainText("真实终点");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出快照", exact: true }).click();
  const output = await pending;
  const value = JSON.parse(await readFile((await output.path())!, "utf8"));
  expect(value.geographic_mission.crs).toBe("EPSG:4326");
  expect(value.geographic_mission.destination.point).toEqual([121.51, 31.252]);
  expect(value.geographic_mission.route_status).toBe("not_planned");
  expect(value.drafts[0].geo.origin.source).toBe("coordinates");
});
test("browser location is permission based and never relocates demo geometry", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    longitude: 114.0579,
    latitude: 22.5431,
    accuracy: 25,
  });
  await page.getByRole("button", { name: "地点定位 L" }).click();
  await page.getByRole("button", { name: "定位我", exact: true }).click();
  await expect(page.getByLabel("选中地点名称")).toHaveValue("我的当前位置");
  await expect(page.locator(".geo-point-value")).toContainText("114.057900");
  await expect(page.locator(".geo-point-value")).toContainText("25m");
  await expect(page.locator(".geo-label.site")).toHaveCount(4);
  await search(page, "181,31");
  await expect(page.locator(".location-message")).toContainText("坐标超出范围");
  await expect(page.getByLabel("选中地点名称")).toHaveValue("我的当前位置");
});
test("map clicks create real selection, geocoding is explicit, and edited names drop stale coordinates", async ({
  page,
}) => {
  const canvas = page.locator(".geo-map canvas");
  expect((await canvas.boundingBox())!.height).toBeGreaterThan(300);
  await canvas.click({ position: { x: 420, y: 220 } });
  await expect(page.getByLabel("选中地点名称")).toHaveValue("地图选点");
  await page.route("**/api/assistant/places/search?*", (r) =>
    r.fulfill({
      json: {
        places: [
          {
            name: "检索到的测试地点",
            point: [121.52, 31.26],
            source: "osm_search",
            capturedAt: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await search(page, "上海 测试地址");
  await page.locator(".place-results").getByRole("button").click();
  await page.getByRole("button", { name: "设为终点", exact: true }).click();
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("改名解绑");
  await page.getByLabel("起点", { exact: true }).fill("手动起点");
  await page.getByLabel("终点", { exact: true }).fill("另一个地点");
  await page.getByRole("button", { name: "保存任务草稿" }).click();
  const draft = await page.evaluate(
    () => JSON.parse(localStorage.getItem("aeris-drafts-v1")!)[0],
  );
  expect(draft.geo.destination).toBeNull();
});
test("terrain experiment retains patch revisions and event stream filters and scrolls", async ({
  page,
}) => {
  await page.getByRole("button", { name: "地形数据设置", exact: true }).click();
  await page
    .getByRole("button", { name: "注入一次演示地形变化", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  await page.getByRole("button", { name: "地形实验", exact: true }).click();
  await expect(page.locator(".map-render canvas")).toBeVisible();
  await page.getByRole("button", { name: "真实地图", exact: true }).click();
  await expect(page.locator(".terrain-status")).toContainText("REV 001");
  const feed = page.locator(".event-panel");
  const scroll = feed.getByLabel("可滚动事件时间线");
  expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await scroll.hover();
  await page.mouse.wheel(0, 200);
  await expect(
    feed.getByRole("button", { name: "已暂停", exact: true }),
  ).toBeVisible();
  await feed.getByRole("button", { name: "告警", exact: true }).click();
  await expect(feed.locator("details.info")).toHaveCount(0);
  await expect(feed.locator("details.warning").first()).toBeVisible();
  await page.getByRole("button", { name: "新手分步引导", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "新手分步引导", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.locator(".onboarding-step")).toContainText("2 / 3");
});

test("historical route and negative profile can be compared without replacing the mission", async ({
  page,
}) => {
  await page.getByRole("button", { name: "方案", exact: true }).click();
  await expect(page.locator(".route-review-card")).toHaveCount(5);
  const route = page
    .locator(".route-review-card")
    .filter({ hasText: "RT-S2-01-A" });
  await expect(route.locator(".review-minimum strong")).toHaveClass("negative");
  const minimum = await route.locator(".review-minimum strong").textContent();
  await route.getByRole("button", { name: "地图与剖面对比" }).click();
  await expect(page.locator(".review-map-label")).toContainText("RT-S2-01-A");
  await expect(page.locator(".margin-summary strong")).toContainText(
    minimum!.replace("Wh", "").trim(),
  );
  await expect(
    page.getByRole("img", {
      name: "历史演示备降余量曲线 RT-S2-01-A，零线以下为负余量",
    }),
  ).toBeVisible();
  await expect(page.locator(".mission-card")).toContainText("应急医疗物资配送");
  await page.getByRole("button", { name: "关闭历史方案对比" }).click();
  await expect(page.locator(".review-map-label")).toHaveCount(0);
  await expect(page.locator(".margin-summary strong")).toContainText("+34.8");
});

test("offline basemap can retry while preserving selected geographic points", async ({
  page,
}) => {
  await expect(page.locator(".basemap-state")).toContainText("离线");
  await page.getByRole("button", { name: "地点定位 L" }).click();
  await search(page, "121.495,31.241");
  await page.getByRole("button", { name: "设为终点", exact: true }).click();
  await page.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {
          fixture: {
            type: "raster",
            tiles: ["https://map-fixture.invalid/{z}/{x}/{y}.png"],
            tileSize: 256,
          },
        },
        layers: [{ id: "fixture", type: "raster", source: "fixture" }],
      },
    }),
  );
  await page.route("https://map-fixture.invalid/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.getByRole("button", { name: "重试真实底图" }).click();
  await expect(page.locator(".basemap-state")).toContainText(
    "真实底图 · CARTO",
  );
  await expect(page.locator(".geo-pin.destination")).toBeVisible();
  await expect(page.locator(".geo-label.site")).toHaveCount(4);
  await expect(page.locator(".geo-point-value")).toContainText("121.495000");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "重试真实底图" }).click();
  await expect(page.locator(".basemap-state")).toContainText(
    "真实底图 · CARTO",
  );
  await expect(page.locator(".geo-point-value")).toContainText("121.495000");
});
