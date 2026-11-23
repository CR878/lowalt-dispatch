import { expect, test } from "@playwright/test";

test("competition replay loads the local model and preserves the simulated mission", async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (!["127.0.0.1", "localhost"].includes(url.hostname))
        external.push(url.href);
    }
  });
  await page.goto("/demo");
  await expect(page.locator(".demo-scene")).toHaveAttribute(
    "data-model",
    "loaded",
    {
      timeout: 30_000,
    },
  );
  await expect(page.locator(".demo-task-status")).toContainText("等待确认");
  await page.getByRole("button", { name: "确认演示工单" }).click();
  await page.getByRole("slider", { name: "演示时间轴" }).fill("118");
  await expect(page.locator(".demo-alert")).toContainText("通信退化情景");
  await page.getByRole("button", { name: "备降复盘", exact: true }).click();
  await expect(page.locator(".demo-task-status")).toContainText("物资待接续");
  await page.getByRole("button", { name: "录制模式" }).click();
  await expect(page.locator(".demo-controls")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".demo-controls")).toBeVisible();
  await page.getByRole("button", { name: "重置" }).click();
  await expect(page.locator(".demo-task-status")).toContainText("等待确认");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
