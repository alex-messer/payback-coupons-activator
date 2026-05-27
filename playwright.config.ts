import { defineConfig } from "@playwright/test";

const { mode } = process.env;
const isProduction = mode === "production";

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Note: the actual browser is launched by the browser fixture
 * (src/fixtures/browser.fixture.ts) which applies anti-automation tweaks.
 * The project entry below only declares the project name; the fixture sets
 * UA, init scripts, and launch args so we do NOT use `devices["Desktop Chrome"]`
 * here (that descriptor pins a Windows UA and would mismatch our Linux host).
 */
export default defineConfig({
  testDir: "./src",
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: isProduction,
  // Retries disabled: rapid re-attempts make PayBack's bot detection worse,
  // and each retry burns another captcha challenge without changing the outcome.
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    headless: isProduction,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 0,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium" }],
});
