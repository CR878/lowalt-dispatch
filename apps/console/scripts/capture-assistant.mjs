import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (error) => console.error("PAGE ERROR:", error.message));
await page.goto("http://127.0.0.1:5174");
await page.getByText("构建数字空域…").waitFor({ state: "hidden" });
await page.getByRole("button", { name: "打开调度助手", exact: true }).click();
await page.locator(".assistant-connection.online").waitFor();
await mkdir("preview", { recursive: true });
await page.screenshot({
  path: "preview/assistant-welcome.png",
  fullPage: true,
});
await page
  .getByRole("textbox", { name: "向调度助手提问" })
  .fill("从医疗物资中转站到北区应急中心，配送1公斤药品，预览路线");
await page.getByRole("button", { name: "发送给调度助手" }).click();
await page.getByRole("region", { name: "路线预览结果" }).waitFor();
await page.getByRole("button", { name: "地图展示预览", exact: true }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "preview/assistant-task.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "preview/assistant-mobile.png", fullPage: true });
await browser.close();
