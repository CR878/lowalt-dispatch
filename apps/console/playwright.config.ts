import { defineConfig, devices } from "@playwright/test";

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
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
