import { test, expect } from "@playwright/test";
import { authenticate } from "./fixtures";

test("public landing establishes context, reserves the 3D slot and redirects protected pages", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "让每一次低空任务",
  );
  await expect(page.locator('[data-model-slot="hero"]')).toBeVisible();
  await expect(page.locator(".p-hero-cta")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /低空配送/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /园区巡检/ })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("复杂空间，清晰掌握");
  await page.keyboard.press("Home");
  await page.locator(".l-brand").first().focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/design-home.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/design-home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/missions/new");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.locator(".p-auth-form h2")).toBeVisible();
  await page.screenshot({
    path: "test-results/design-login.png",
    fullPage: true,
  });
});

test("login returns to the intended task, then actual M3 chain persists a result", async ({
  page,
  request,
}) => {
  // Initialize the isolated test workspace, then log in through the UI.
  await authenticate(page.context().request);
  await page.context().request.post("/api/auth/logout", {
    headers: { "X-Aeris-Request": "1" },
    data: {},
  });
  await page.goto("/missions/new");
  await page.getByLabel("工作邮箱").fill("browser@example.com");
  await page.getByLabel("密码", { exact: true }).fill("BrowserTest2026");
  await page.getByRole("button", { name: "登录工作区" }).click();
  await expect(page).toHaveURL("/missions/new");
  await expect(page.locator(".p-stepper .current")).toContainText("定义任务");
  await page.getByRole("button", { name: "生成待审任务" }).click();
  await expect(page.locator(".p-stepper .current")).toContainText("核对与审核");
  await page.screenshot({
    path: "test-results/design-review.png",
    fullPage: true,
  });
  const run = page.getByRole("button", { name: "确认并运行本地任务" });
  await expect(run).toBeDisabled();
  await page.getByRole("checkbox", { name: /我已核对任务参数/ }).check();
  await run.click();
  await expect(
    page.getByRole("heading", { name: "任务结果已保存" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/design-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "查看任务详情" }).click();
  await expect(page.locator(".p-evidence-chain")).toContainText(
    "MOCK.AUTO.MISSION",
  );
  await expect(page.locator(".p-audit-flow")).toContainText("tool");
  await page.reload();
  await expect(page.locator(".p-evidence-chain")).toContainText(
    "MOCK.AUTO.MISSION",
  );
  await page
    .getByRole("button", { name: "结束本次合成测试", exact: true })
    .click();
  await page.getByRole("button", { name: "确认结束合成测试" }).click();
  await expect(page.locator(".p-detail-status")).toContainText("执行失败");
  await page.route("https://basemaps.cartocdn.com/**", (route) =>
    route.abort(),
  );
  await page.getByRole("button", { name: "打开空域态势" }).click();
  await expect(page).toHaveURL(/\/airspace\?task=/);
  await expect(page.locator(".assistant-preview-label")).toContainText(
    "任务航线",
  );
  await page.screenshot({
    path: "test-results/design-map.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("custom ENU planning calls task, snapshot and planner APIs and exports a version", async ({
  page,
  request,
}) => {
  await authenticate(page.context().request);
  await page.goto("/missions/new");
  await page.getByRole("button", { name: /自定义航线/ }).click();
  await page.getByRole("button", { name: "生成待审任务" }).click();
  await expect(
    page.getByRole("heading", { name: "确认这一次任务的边界。" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /我已核对任务参数/ }).check();
  await page.getByRole("button", { name: "确认并规划航线" }).click();
  await expect(
    page.getByRole("heading", { name: "任务结果已保存" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看规划详情" }).click();
  await expect(page.locator(".p-plan-row")).toContainText("可行");
  await expect(page.locator(".p-diagnostic")).toContainText("当前算法");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整记录" }).click();
  expect((await download).suggestedFilename()).toMatch(/^aeris-P-/);
});

test("workspace search, draft resume and mobile navigation remain usable", async ({
  page,
  request,
}) => {
  await authenticate(page.context().request);
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "欢迎回到工作台",
  );
  await expect(page.locator(".p-service-list")).toContainText("任务 Agent");
  await expect(
    page.locator(".p-stat").first().locator("strong"),
  ).not.toHaveText("—");
  await page.screenshot({
    path: "test-results/design-workspace.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿，稍后继续" }).click();
  await expect(page.locator(".p-draft-notice")).toContainText("任务草稿");
  await page.getByRole("button", { name: "继续编辑" }).click();
  await expect(page.locator(".p-stepper")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "全局搜索" });
  await dialog.getByPlaceholder("查找模块或任务编号…").fill("角色");
  await dialog.getByRole("button", { name: "角色权限" }).click();
  await expect(page.getByRole("heading", { name: "角色与权限" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开导航", exact: true }).click();
  await page
    .getByRole("navigation", { name: "工作区导航" })
    .getByRole("button", { name: "工作台", exact: true })
    .click();
  await expect(page.locator(".p-sidebar")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/design-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
