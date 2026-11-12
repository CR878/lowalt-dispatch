import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5174");
  await page
    .getByText("构建数字空域…")
    .waitFor({ state: "hidden", timeout: 30000 });
  await page.waitForTimeout(8000);
  await mkdir("preview", { recursive: true });
  await page.screenshot({
    path: "preview/geographic-console.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      status: await page.locator(".basemap-state").textContent(),
      errors,
    }),
  );
  await page.getByRole("button", { name: "地点定位 L" }).click();
  await page
    .getByRole("textbox", { name: "搜索地点或经纬度" })
    .fill("121.495,31.241");
  await page.getByRole("button", { name: "搜索地点", exact: true }).click();
  await page
    .getByRole("textbox", { name: "选中地点名称" })
    .fill("测试起点 · 真实坐标");
  await page.getByRole("button", { name: "设为起点", exact: true }).click();
  await page
    .getByRole("textbox", { name: "搜索地点或经纬度" })
    .fill("121.51,31.252");
  await page.getByRole("button", { name: "搜索地点", exact: true }).click();
  await page
    .getByRole("textbox", { name: "选中地点名称" })
    .fill("测试终点 · 真实坐标");
  await page.getByRole("button", { name: "设为终点", exact: true }).click();
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: "preview/geographic-selection.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "preview/geographic-mobile.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      overflow: await page.evaluate(
        () => document.body.scrollWidth > innerWidth,
      ),
      errors,
    }),
  );
} finally {
  await browser.close();
}
