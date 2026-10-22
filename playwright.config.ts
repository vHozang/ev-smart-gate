import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Safe development defaults are loaded first; local secrets in .env override them.
dotenv.config({ path: ".env.example", quiet: true });
dotenv.config({ path: ".env", override: true, quiet: true });

const baseURL = process.env.DEMO_BASE_URL || "http://localhost:8000";

export default defineConfig({
  testDir: "./tests/demo",
  outputDir: ".playwright/demo-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "dist/demo/playwright-report", open: "never" }],
  ],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "on",
  },
  projects: [
    {
      name: "mvp-demo",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        baseURL,
        viewport: { width: 1440, height: 900 },
        video: {
          mode: "on",
          size: { width: 1440, height: 900 },
          show: {
            actions: {
              duration: 600,
              position: "top-right",
              fontSize: 14,
            },
            test: {
              level: "step",
              position: "top-left",
              fontSize: 13,
            },
          },
        },
      },
    },
  ],
});
