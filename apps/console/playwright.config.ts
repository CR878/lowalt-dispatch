import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const telemetryFixture = resolve("test-results/telemetry-feed.ndjson");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1600, height: 1000 },
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    launchOptions: {
      ...(process.env.CI ? {} : { channel: "chrome" }),
      args: ["--enable-unsafe-swiftshader"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run assistant",
      url: "http://127.0.0.1:8012/api/assistant/health",
      reuseExistingServer: !process.env.CI,
      env: {
        AERIS_TELEMETRY_FILE: telemetryFixture,
        AERIS_DISPATCH_TRANSPORT: "direct",
        AERIS_DISPATCH_DIR: resolve(
          "../../logs/browser-tests",
          String(Date.now()),
        ),
      },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
