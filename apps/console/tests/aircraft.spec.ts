import { test, expect } from "./fixtures";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

test("official aircraft catalogue keeps sources and selection across planning", async ({
  page,
}) => {
  await page.goto("/aircraft");
  await expect(
    page.getByRole("heading", { name: "DJI FlyCart 30", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "DJI FlyCart 100", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wingcopter 198", exact: true }),
  ).toBeVisible();
  const card = page.getByTestId("aircraft-dji-flycart-30");
  await card.getByRole("button", { name: "选用此机型" }).click();
  await card.getByText("参数、工况与官方来源").click();
  await expect(
    card.getByRole("link", { name: "DJI FlyCart 30 官方技术参数" }),
  ).toHaveAttribute("href", "https://www.dji.com/cn/flycart-30/specs");
  await expect(card).toContainText("16 km 为双电、30 kg 满载");
  await card.getByText("参数、工况与官方来源").click();
  await page.getByLabel("测试距离 (km)").fill("10");
  await page.getByLabel("配送载荷 (kg)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "运行参数测试" }).click();
  const result = page.getByTestId("vehicle-assessment");
  await expect(result).toContainText("待补参数");
  await expect(result).toContainText("11.1");
  await page.screenshot({
    path: resolve("../../results/delivery_aircraft_library.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("配送机型", { exact: true })).toHaveValue(
    "dji-flycart-30",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "aeris-geo-mission-v1",
      JSON.stringify({
        origin: {
          name: "测试起点",
          point: [121.46, 31.22],
          source: "coordinates",
          capturedAt: new Date().toISOString(),
        },
        destination: {
          name: "测试终点",
          point: [121.48, 31.22],
          source: "coordinates",
          capturedAt: new Date().toISOString(),
        },
      }),
    ),
  );
  let received: Record<string, unknown> | null = null;
  await page.route("**/api/assistant/navigation/candidates", (r) => {
    received = r.request().postDataJSON();
    return r.fulfill({
      status: 503,
      json: { detail: "测试仅核对机型请求，不下载地图" },
    });
  });
  await page.getByRole("button", { name: "进入航线规划" }).click();
  const planning = page.getByTestId("real-routing");
  await expect(planning.getByLabel("配送机型", { exact: true })).toHaveValue(
    "dji-flycart-30",
  );
  await planning.getByLabel("航线配送载荷").fill("3");
  await planning.getByRole("button", { name: "计算真实避障航线" }).click();
  await expect(planning.getByRole("alert")).toContainText("测试仅核对机型请求");
  expect(received).toMatchObject({
    vehicle_key: "dji-flycart-30",
    payload_kg: 3,
    frame: "WGS84",
  });
});

test("manual profile validates, evaluates wind budget, exports and imports", async ({
  page,
}) => {
  await page.goto("/aircraft");
  await page.getByRole("button", { name: "新建机型" }).click();
  await page.getByLabel("机型名称 *", { exact: true }).fill("浏览器测试机型");
  await page
    .getByLabel("数据来源 *", { exact: true })
    .fill("synthetic UI test fixture; not real aircraft");
  await page.getByLabel("最大载荷 (kg) *", { exact: true }).fill("5");
  await page.getByLabel("测试巡航空速 (m/s) *", { exact: true }).fill("10");
  await page.getByLabel("标称电池总量 (Wh)", { exact: true }).fill("200");
  await page.getByLabel("实际可用电量 (Wh)", { exact: true }).fill("300");
  await page.getByLabel("保留电量 (Wh)", { exact: true }).fill("30");
  await page
    .getByLabel("巡航单位距离能耗 (Wh/m)", { exact: true })
    .fill("0.01");
  await page.getByRole("button", { name: "校验并保存" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "可用电量不能超过标称电量",
  );
  await page.getByLabel("实际可用电量 (Wh)", { exact: true }).fill("150");
  await page.getByRole("button", { name: "校验并保存" }).click();
  await expect(page.getByRole("status")).toContainText("已保存并选用");
  await page.getByLabel("测试距离 (km)").fill("10");
  await page.getByLabel("配送载荷 (kg)", { exact: true }).fill("2");
  await page.getByLabel("测试风向", { exact: true }).selectOption("headwind");
  await page.getByLabel("测试风速 (m/s)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "运行参数测试" }).click();
  const result = page.getByTestId("vehicle-assessment");
  await expect(result).toContainText("200 Wh");
  await expect(result).toContainText("-80 Wh");
  await expect(result).toContainText("超出参考边界");
  await page.getByLabel("测试风向", { exact: true }).selectOption("calm");
  await expect(page.getByRole("alert")).toContainText("参数已更改");
  await page.getByRole("button", { name: "运行参数测试" }).click();
  await expect(result).toContainText("100 Wh");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const downloaded = await downloading;
  const content = await readFile((await downloaded.path())!, "utf8");
  expect(JSON.parse(content).energy_per_meter_wh).toBe(0.01);
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByLabel("导入机型 JSON").setInputFiles({
    name: "profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  await expect(page.getByRole("status")).toContainText("已导入并选用");
  await page.reload();
  await expect(page.locator(".aircraft-custom-row")).toContainText(
    "浏览器测试机型",
  );
  await page.getByLabel("导入机型 JSON").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"display_name":"bad"}'),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".aircraft-custom-row")).toHaveCount(1);
});

test("mobile catalogue is usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/aircraft");
  await expect(
    page.getByRole("heading", { name: "DJI FlyCart 30", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByTestId("aircraft-wingcopter-198")
    .getByRole("button", { name: "选用此机型" })
    .click();
  await expect(page.getByLabel("配送机型", { exact: true })).toHaveValue(
    "wingcopter-198",
  );
});
