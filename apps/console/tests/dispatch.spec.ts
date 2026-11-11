import { expect, test } from "@playwright/test";

test("reviewed local task reaches actual M3/M2/M4 and survives panel reopening", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "本地任务联调", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "本地任务联调", exact: true });
  await expect(
    panel.getByText("飞控控制：关闭", { exact: false }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "生成待审任务" }).click();
  const confirm = panel.getByRole("button", { name: "确认并运行本地任务" });
  await expect(confirm).toBeDisabled();
  await panel
    .getByRole("checkbox", { name: "我已核对参数，确认仅进行本地合成执行" })
    .check();
  await confirm.click();
  await expect(panel.getByText("执行端已受理", { exact: true })).toBeVisible();
  await expect(panel.getByText("合成执行中", { exact: true })).toBeVisible();
  await expect(panel.getByText("v1 / 1", { exact: true })).toBeVisible();
  await expect(panel.getByText("已接受 · MOCK.AUTO.MISSION")).toBeVisible();
  await panel.getByText("查看工具审计与状态流（最近30条）").click();
  await expect(panel.locator(".dispatch-events li").first()).toBeVisible();
  const taskId = await panel.locator(".dispatch-id").innerText();
  await panel.getByRole("button", { name: "关闭面板" }).click();
  await page.getByRole("button", { name: "本地任务联调", exact: true }).click();
  await expect(page.locator(".dispatch-id")).toHaveText(taskId);
  await expect(page.getByText("v1 / 1", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "结束本次合成测试", exact: true })
    .click();
  await expect(page.getByText("执行失败", { exact: true })).toBeVisible();
});
