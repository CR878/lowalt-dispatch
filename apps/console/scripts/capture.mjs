import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => console.error("PAGE ERROR:", error.message));
await page.goto("http://127.0.0.1:5174");
await page.getByText("构建数字空域…").waitFor({ state: "hidden" });
await page.waitForTimeout(2500);
await mkdir("preview", { recursive: true });
await page.screenshot({ path: "preview/desktop.png", fullPage: true });
console.log(
  await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.body.scrollWidth,
    height: innerHeight,
    scrollHeight: document.body.scrollHeight,
  })),
);
await page.getByRole("button", { name: "2D", exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "preview/desktop-2d.png", fullPage: true });
await page.getByRole("button", { name: "3D", exact: true }).click();
await page.getByRole("button", { name: "地形数据设置", exact: true }).click();
await page
  .getByRole("button", { name: "注入一次演示地形变化", exact: true })
  .click();
await page.getByRole("button", { name: "关闭面板", exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "preview/terrain-change.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "preview/mobile.png", fullPage: true });
console.log(
  await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.body.scrollWidth,
  })),
);
await browser.close();
