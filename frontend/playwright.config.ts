import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  fullyParallel: true,
  workers: 2,
  outputDir: '../.tmp/frontend-qa/results',
  reporter: [['list'], ['junit', { outputFile: '../.tmp/frontend-qa/junit.xml' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: 'npm run preview -- --port 5173',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
