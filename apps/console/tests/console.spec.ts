import { expect, test } from "@playwright/test";
import { baseHeight, GRID_STEP, TerrainModel } from "../src/terrain";
import type { TerrainPatch } from "../src/types";

test("terrain patches are atomic, versioned, and locate the actual changed cells", () => {
  const model = new TerrainModel();
  const original = model.heights.slice();
  const patch: TerrainPatch = {
    revision: 1,
    source: "test DEM",
    capturedAt: "2026-11-10T00:00:00Z",
    cells: [
      { x: 2, y: 4, height: baseHeight(2 * GRID_STEP, 4 * GRID_STEP) + 10 },
    ],
  };
  expect(() =>
    model.apply({
      ...patch,
      cells: [...patch.cells, { x: 91, y: 0, height: 0 }],
    }),
  ).toThrow();
  expect(model.heights).toEqual(original);
  expect(model.revision).toBe(0);
  const changed = model.apply(patch);
  expect(changed.count).toBe(1);
  expect(changed.maxDelta).toBeCloseTo(10, 3);
  expect(changed.bounds?.minX).toBeCloseTo(2 * GRID_STEP);
  expect(changed.bounds?.minY).toBeCloseTo(4 * GRID_STEP);
  expect(() => model.apply(patch)).toThrow("地形版本必须递增");
  expect(() =>
    model.apply({
      ...patch,
      revision: 2,
      cells: [patch.cells[0], patch.cells[0]],
    }),
  ).toThrow("地形网格重复");
  expect(() => model.apply(null as unknown as TerrainPatch)).toThrow(
    "地形补丁格式不合法",
  );
  expect(model.revision).toBe(1);
  expect(() =>
    model.apply({ ...patch, revision: 2, mode: "baseline" }),
  ).toThrow("地形基准必须包含完整的91×91网格");
  const baselineCells = Array.from({ length: 91 * 91 }, (_, i) => ({
    x: i % 91,
    y: Math.floor(i / 91),
    height: 20,
  }));
  expect(
    model.apply({
      ...patch,
      revision: 2,
      mode: "baseline",
      cells: baselineCells,
    }).count,
  ).toBe(0);
  expect(model.heights[0]).toBe(20);
});

test.beforeEach(async ({ page }) => {
  await page.route("https://basemaps.cartocdn.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(page.getByText("构建数字空域…")).toBeHidden();
});

test("scene, 2D/3D controls, replay and exports work without external map services", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".map-render canvas")).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "重置视角", exact: true }).click();
  await page.keyboard.press("v");
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "暂停演示 空格", exact: true })
    .click();
  const slider = page.getByRole("slider", { name: "演示轨迹进度" });
  const value = await slider.inputValue();
  await page.waitForTimeout(850);
  expect(await slider.inputValue()).toBe(value);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出快照", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^aeris-DEMO-.*\.json$/);
  expect(errors).toEqual([]);
});

test("panels can be hidden, restored, and remembered; focus view remains reversible", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "隐藏飞行仪表 2", exact: true })
    .click();
  await expect(page.locator(".instruments")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".instruments")).toHaveCount(0);
  await page.locator("h1").click();
  await page.keyboard.press("2");
  await expect(page.locator(".instruments")).toBeVisible();
  await page
    .getByRole("button", { name: "隐藏感知与搜索 5", exact: true })
    .click();
  await expect(page.locator(".perception-card")).toHaveCount(0);
  await page.locator("h1").click();
  await page.keyboard.press("5");
  await expect(page.locator(".perception-card")).toBeVisible();
  await page.getByRole("button", { name: "专注视图 F", exact: true }).click();
  await expect(page.locator(".app")).toHaveClass(/focus-mode/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).not.toHaveClass(/focus-mode/);
});

test("terrain changes redraw the scene and emit a visible audit event", async ({
  page,
}) => {
  await page.getByRole("button", { name: "地形数据设置", exact: true }).click();
  await page
    .getByRole("button", { name: "注入一次演示地形变化", exact: true })
    .click();
  await expect(page.getByText("REV 001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();
  await expect(page.locator(".terrain-status")).toHaveClass(/changed/);
  await expect(
    page.getByText("识别到地形高程变化", { exact: true }),
  ).toBeVisible();
});

test("WebSocket accepts a terrain update and rejects a stale revision", async ({
  page,
}) => {
  await page.routeWebSocket("ws://127.0.0.1:8765/terrain", (ws) => {
    ws.send(
      JSON.stringify({
        type: "terrain.patch",
        patch: {
          revision: 7,
          source: "test streaming DEM",
          capturedAt: new Date().toISOString(),
          cells: [{ x: 0, y: 0, height: 30 }],
        },
      }),
    );
  });
  await page.getByRole("button", { name: "地形数据设置", exact: true }).click();
  await page.getByLabel("WebSocket 地址").fill("ws://127.0.0.1:8765/terrain");
  await page.getByRole("button", { name: "连接数据流", exact: true }).click();
  await expect(page.getByText("REV 007", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "断开数据流", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "断开数据流", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "连接数据流", exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles({
    name: "stale.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        revision: 6,
        source: "stale",
        capturedAt: new Date().toISOString(),
        cells: [{ x: 0, y: 0, height: 90 }],
      }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("地形版本必须递增");
  await expect(page.getByText("REV 007", { exact: true })).toBeVisible();
});

test("task drafts retain all fields and do not submit a flight command", async ({
  page,
}) => {
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("夜间应急配送");
  await page.getByLabel("起点", { exact: true }).fill("东区医院");
  await page.getByLabel("终点", { exact: true }).fill("西区药房");
  await page.getByLabel("载荷 / kg", { exact: true }).fill("2.5");
  await page
    .getByLabel("任务优先级", { exact: true })
    .selectOption({ label: "P2 · 常规" });
  await page.getByRole("button", { name: /保存任务草稿/ }).click();
  const card = page.locator(".task-card").filter({ hasText: "夜间应急配送" });
  await expect(card).toContainText("东区医院");
  await expect(card).toContainText("西区药房");
  await expect(card).toContainText("2.5 kg");
  await expect(card).toContainText("P2 · 常规");
  await expect(card).toContainText("尚未提交");
  await page.reload();
  await page
    .getByRole("button", { name: /任务空间/ })
    .first()
    .click();
  await expect(
    page.locator(".task-card").filter({ hasText: "夜间应急配送" }),
  ).toContainText("西区药房");
});

test("desktop instruments are not clipped and mobile does not scroll horizontally", async ({
  page,
}) => {
  const bounds = await page.locator(".telemetry-panel").boundingBox();
  const link = await page.locator(".link-row").boundingBox();
  expect(link!.y + link!.height).toBeLessThanOrEqual(
    bounds!.y + bounds!.height,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toBeVisible();
  await page
    .locator(".rail")
    .getByRole("button", { name: "组件管理", exact: true })
    .click();
  const close = page.getByRole("button", { name: "关闭面板", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "恢复默认布局", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a missing scene produces an actionable error, not a permanent spinner", async ({
  page,
}) => {
  await page.route("**/demo-scene.json", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("虚拟场景加载失败");
  await expect(page.getByText("构建数字空域…")).toBeHidden();
});
