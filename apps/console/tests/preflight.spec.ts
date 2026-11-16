import { test, expect } from "./fixtures";
import {
  assessPreflight,
  checklist,
  createPreflight,
  emptyPreflight,
} from "../src/navigation/compliance";
import { parseRoutes } from "../src/navigation/engine";
import { readFile } from "node:fs/promises";

const route = parseRoutes({
  id: "review-test",
  title: "核对测试",
  source: "test fixture",
  frame: "WGS84",
  altitude_ref: "agl",
  task_id: "t1",
  plan_version: "v1",
  is_simulated: false,
  waypoints: [
    { x: 121.47, y: 31.23, altitude: 80 },
    { x: 121.48, y: 31.24, altitude: 100 },
  ],
})[0];
const now = Date.parse("2026-11-16T02:00:00Z");
function completed() {
  const draft = emptyPreflight();
  Object.assign(draft, {
    aircraftClass: "small",
    operation: "视距内非经营性巡检",
    flightFrom: "2026-11-16T03:00:00Z",
    flightUntil: "2026-11-16T04:00:00Z",
    checkedAt: "2026-11-16T01:00:00Z",
    validFrom: "2026-11-16T00:00:00Z",
    validUntil: "2026-11-16T05:00:00Z",
    airspaceSource: "测试发布源与版本（非实际许可）",
    coverage: "测试范围与 AGL 核对",
  });
  for (const [id] of checklist)
    draft.entries[id] = { status: "recorded", note: "测试资料索引" };
  return createPreflight(draft, route, true);
}

test("below 120m does not imply permission and requires all evidence", () => {
  expect(
    assessPreflight(
      createPreflight(emptyPreflight(), route, true),
      route,
      true,
      now,
    ).issues.length,
  ).toBeGreaterThan(8);
  const record = completed();
  expect(assessPreflight(record, route, true, now)).toEqual({
    issues: [],
    documented: 8,
  });
  expect(record.authorization).toBe("not_determined");
  expect(record.dispatch_enabled).toBe(false);
  record.draft.entries.airspace = { status: "na", note: "低于120米" };
  expect(assessPreflight(record, route, true, now).issues.join()).toContain(
    "官方空域",
  );
});

test("record detects expired or incomplete time coverage, version changes and unknown datum", () => {
  const record = completed();
  expect(
    assessPreflight(
      record,
      { ...route, plan_version: "v2" },
      true,
      now,
    ).issues.join(),
  ).toContain("版本");
  expect(
    assessPreflight(
      record,
      { ...route, altitude_ref: "rel_takeoff" },
      true,
      now,
    ).issues.join(),
  ).toContain("离地高度");
  record.draft.validUntil = "2026-11-16T03:30:00Z";
  expect(assessPreflight(record, route, true, now).issues.join()).toContain(
    "未覆盖全部",
  );
  record.draft.validUntil = "2026-11-16T01:30:00Z";
  expect(assessPreflight(record, route, true, now).issues.join()).toContain(
    "已过期",
  );
  record.draft.checkedAt = "2026-11-16T08:00:00Z";
  expect(assessPreflight(record, route, true, now).issues.join()).toContain(
    "晚于当前",
  );
});

test("simulation, unknown aircraft and undocumented not-applicable entries stay unresolved", () => {
  const record = completed();
  record.is_simulated = true;
  record.draft.aircraftClass = "unknown";
  record.draft.entries.insurance = { status: "na", note: "" };
  const result = assessPreflight(record, route, true, now);
  expect(result.documented).toBe(7);
  expect(result.issues.join()).toContain("演练");
  expect(result.issues.join()).toContain("分类");
  expect(result.issues.join()).toContain("责任保险");
  record.draft.entries.insurance.note = "适用条件经作业负责人复核的索引";
  expect(assessPreflight(record, route, true, now).documented).toBe(8);
});

test("preflight exports scoped evidence, preserves drafts between tabs, and permits rehearsal with pending checks", async ({
  page,
}) => {
  await page.route("https://basemaps.cartocdn.com/**", (r) => r.abort());
  await page.goto("/airspace?navigation=1");
  const nav = page.getByRole("region", { name: "无人机导航工作区" });
  await nav.getByRole("button", { name: "飞前核对", exact: true }).click();
  await expect(nav.getByRole("region", { name: "飞前核对记录" })).toBeVisible();
  await nav
    .getByLabel("运行方式与任务性质", { exact: true })
    .fill("视距内演练测试");
  await nav.getByRole("button", { name: "航线与方案", exact: true }).click();
  await nav.getByRole("button", { name: "开始航线演练", exact: true }).click();
  await nav.getByRole("button", { name: "确认启用参考", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "航点导航引导" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "飞前核对", exact: true }).click();
  await expect(
    nav.getByLabel("运行方式与任务性质", { exact: true }),
  ).toHaveValue("视距内演练测试");
  await nav.getByRole("button", { name: "保存本次核对", exact: true }).click();
  await expect(nav.locator(".nav-preflight-result")).toContainText(
    "非飞行许可",
  );
  await expect(nav.locator(".nav-preflight-result")).toContainText("离地高度");
  const downloadPromise = page.waitForEvent("download");
  await nav.getByRole("button", { name: "导出核对记录", exact: true }).click();
  const download = await downloadPromise;
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.authorization).toBe("not_determined");
  expect(data.dispatch_enabled).toBe(false);
  expect(data.time_zone).toBeTruthy();
  expect(data.draft.operation).toBe("视距内演练测试");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/preflight-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
