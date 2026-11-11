import { expect, test } from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test("M4 telemetry updates, becomes stale and recovers without demo values", async ({
  page,
}) => {
  const path = resolve("test-results/telemetry-feed.ndjson");
  mkdirSync(resolve("test-results"), { recursive: true });
  writeFileSync(path, "");
  const publish = (battery: number) =>
    appendFileSync(
      path,
      JSON.stringify({
        source: "test:m4",
        is_simulated: true,
        captured_at: new Date().toISOString(),
        battery,
        pitch: 0,
        roll: 0,
        in_air: false,
        position: { frame: "NED", x_m: 1, y_m: 2, z_m: 0 },
      }) + "\n",
    );

  await page.goto("/?telemetry=live");
  const playback = page.locator(".playback");
  const battery = page.getByTestId("telemetry-battery");
  await expect(playback).toContainText("等待遥测");
  await expect(battery).toHaveText("—");
  await expect(page.getByLabel("演示轨迹进度")).toHaveCount(0);

  publish(0);
  await expect(playback).toContainText("test:m4 · 实时 · 仿真");
  await expect(playback).toContainText("NED");
  await expect(battery).toHaveText("0.0");
  await expect(playback).toContainText("遥测已过期", { timeout: 8000 });
  await expect(battery).toHaveText("0.0");

  publish(42.5);
  await expect(playback).toContainText("test:m4 · 实时 · 仿真");
  await expect(battery).toHaveText("42.5");
});
