import { test, expect } from "./fixtures";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const route = {
  id: "nav-live",
  title: "版本匹配测试航线",
  source: "browser telemetry fixture",
  frame: "ENU",
  altitude_ref: "rel_takeoff",
  task_id: "nav-task",
  plan_version: "nav-v1",
  is_simulated: true,
  waypoints: [
    { x: 0, y: 0, altitude: 100 },
    { x: 100, y: 0, altitude: 120 },
    { x: 100, y: 100, altitude: 120 },
  ],
};
const fixture = resolve("test-results/telemetry-feed.ndjson");
async function importRoute(
  page: import("@playwright/test").Page,
  value: unknown,
) {
  await page.locator('.nav-workspace input[type="file"]').setInputFiles({
    name: "reference.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
test("navigation compares computed alternatives and rehearses without any dispatch call", async ({
  page,
}) => {
  // Exercise the browser adapter without requesting a real microphone or cloud recognizer.
  await page.addInitScript(() => {
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      class {
        onresult: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          window.setTimeout(() => {
            this.onresult?.({ results: [[{ transcript: "全览。" }]] });
            this.onend?.();
          }, 20);
        }
        abort() {
          this.onend?.();
        }
      };
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let flightCalls = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/api\/dispatch\/.+\/(confirm|abandon)$/.test(r.url())
    )
      flightCalls++;
  });
  await page.route("https://basemaps.cartocdn.com/**", (r) =>
    r.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "bg",
            type: "background",
            paint: {
              "background-color": r.request().url().includes("dark-matter")
                ? "#101c2d"
                : "#edf3f8",
            },
          },
        ],
      },
    }),
  );
  await page.goto("/airspace");
  await page.getByRole("button", { name: "飞行导航", exact: true }).click();
  const nav = page.getByRole("region", { name: "无人机导航工作区" });
  await expect(nav.locator(".nav-route-card")).toHaveCount(1);
  await nav.getByRole("button", { name: "计算场景方案", exact: true }).click();
  await expect(nav.locator(".nav-route-card")).toHaveCount(3);
  await expect(nav.locator(".nav-comparison")).toContainText(
    "不替换已执行任务",
  );
  await nav.getByRole("button", { name: "开始航线演练", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "导航参考确认" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "确认启用参考", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "航点导航引导" }),
  ).toBeVisible();
  await expect(nav.locator(".nav-guide-card")).not.toContainText("NaN");
  await nav.getByLabel("不中断地图的快捷操作").fill("悬停");
  await nav.getByRole("button", { name: "执行视图操作" }).click();
  await expect(page.locator(".toast")).toContainText("只调整视图和演练");
  await nav.getByRole("button", { name: "开始语音输入", exact: true }).click();
  await expect(nav.getByLabel("不中断地图的快捷操作")).toHaveValue("全览");
  await expect(
    nav.getByRole("button", { name: "跟随中", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await nav.getByRole("button", { name: "执行视图操作" }).click();
  await expect(
    nav.getByRole("button", { name: "恢复跟随", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "切换到夜间模式" }).click();
  await expect(
    page.getByRole("region", { name: "航点导航引导" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/navigation-night.png",
    fullPage: true,
    animations: "disabled",
  });
  await nav.getByRole("button", { name: "导航设置", exact: true }).click();
  await nav.getByLabel("偏航提醒阈值").selectOption("50");
  await page.reload();
  await page.getByRole("button", { name: "飞行导航", exact: true }).click();
  await page.getByRole("button", { name: "导航设置", exact: true }).click();
  await expect(page.getByLabel("偏航提醒阈值")).toHaveValue("50");
  expect(flightCalls).toBe(0);
  expect(errors).toEqual([]);
});

test("live ENU guidance matches task/version and pauses on stale telemetry", async ({
  page,
}) => {
  mkdirSync(resolve("test-results"), { recursive: true });
  writeFileSync(fixture, "");
  let version = "nav-v1";
  const publish = () =>
    appendFileSync(
      fixture,
      JSON.stringify({
        source: "test:nav",
        captured_at: new Date().toISOString(),
        is_simulated: true,
        task_id: "nav-task",
        plan_version: version,
        position: { frame: "NED", x_m: 10, y_m: 50, z_m: -90 },
        altitude: 90,
        altitude_ref: "rel_takeoff",
        speed: 10,
        heading: 90,
        battery: 12,
      }) + "\n",
    );
  publish();
  const timer = setInterval(publish, 600);
  try {
    await page.goto("/fleet");
    await expect(page.locator(".playback")).toContainText("test:nav · 实时");
    await page.getByRole("button", { name: "飞行导航", exact: true }).click();
    const free = page.getByRole("region", { name: "无人机导航工作区" });
    await free
      .getByRole("button", { name: "开始自由观察", exact: true })
      .click();
    await free
      .getByRole("button", { name: "确认启用参考", exact: true })
      .click();
    await expect(free.locator(".nav-alert.critical")).toContainText(
      "电量严重偏低",
    );
    await expect(free.locator(".nav-guide-card")).not.toContainText("150 m");
    await free
      .getByRole("button", { name: "结束参考引导", exact: true })
      .click();
    await free
      .getByRole("button", { name: "返回方案选择", exact: true })
      .click();
    await importRoute(page, route);
    const nav = page.getByRole("region", { name: "无人机导航工作区" });
    await expect(nav.locator(".nav-route-card")).toContainText(
      "版本匹配测试航线",
    );
    await nav
      .getByRole("button", { name: "启用参考引导", exact: true })
      .click();
    await nav
      .getByRole("button", { name: "确认启用参考", exact: true })
      .click();
    await expect(nav.locator(".nav-guide-card")).toContainText("150 m");
    await expect(page.getByLabel("ENU参考航线")).toBeVisible();
    await expect(nav.locator(".nav-alert.critical")).toContainText(
      "电量严重偏低",
    );
    await nav.getByRole("button", { name: "导航设置", exact: true }).click();
    await expect(nav.locator(".nav-priority-alert")).toContainText(
      "电量严重偏低",
    );
    await nav.getByRole("button", { name: "导航与告警", exact: true }).click();
    version = "nav-v2";
    publish();
    await expect(nav.locator(".nav-section-heading")).toContainText(
      "版本不匹配",
    );
    await expect(nav.locator(".nav-guide-card")).not.toContainText("150 m");
    version = "nav-v1";
    publish();
    await expect(nav.locator(".nav-guide-card")).toContainText("150 m");
    clearInterval(timer);
    await expect(nav.locator(".nav-section-heading")).toContainText(
      "遥测缺失或过期",
      { timeout: 10000 },
    );
    await expect(nav.locator(".nav-guide-card")).not.toContainText("150 m");
  } finally {
    clearInterval(timer);
    writeFileSync(fixture, "");
  }
});

test("WGS84 import validates atomically, supports profile and stays within mobile width", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.goto("/airspace");
  await page.getByRole("button", { name: "飞行导航", exact: true }).click();
  const nav = page.getByRole("region", { name: "无人机导航工作区" });
  await importRoute(page, { ...route, frame: "GCJ02" });
  await expect(nav.locator(".nav-error")).toContainText("frame");
  await expect(nav.locator(".nav-route-card")).toHaveCount(1);
  const wgs = {
    ...route,
    id: "wgs",
    title: "真实坐标参考",
    frame: "WGS84",
    waypoints: [
      { x: 121.4737, y: 31.2304, altitude: 100 },
      { x: 121.4767, y: 31.2334, altitude: 120 },
      { x: 121.4797, y: 31.2314, altitude: 100 },
    ],
  };
  await importRoute(page, wgs);
  await expect(nav.locator(".nav-route-card.selected")).toContainText("WGS84");
  await nav.getByRole("button", { name: "开始航线演练", exact: true }).click();
  await nav.getByRole("button", { name: "确认启用参考", exact: true }).click();
  await expect(nav.getByRole("img", { name: "航线高度剖面" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/navigation-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
