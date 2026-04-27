import { defineConfig, devices } from "@playwright/test";

const { mode } = process.env;
const isProduction = mode === "production";

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Note: the actual browser is launched by the stealth fixture
 * (src/fixtures/stealth.fixture.ts) via `playwright-extra` so that
 * anti-bot evasions are applied. The project entry below only sets
 * viewport / device profile defaults.
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

  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
