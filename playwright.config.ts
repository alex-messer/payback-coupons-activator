import { defineConfig, devices } from "@playwright/test";

const { mode } = process.env;
const isProduction = mode === "production";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src",
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: isProduction,
  retries: isProduction ? 3 : 0,
  workers: 1,
  reporter: "html",
  use: {
    headless: isProduction,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 0,
    trace: "on-first-retry",
  },

  projects: [{ name: "firefox", use: devices["Desktop Firefox"] }],
});
