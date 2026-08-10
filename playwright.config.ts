import { defineConfig } from "@playwright/test";

const { mode } = process.env;
const isProduction = mode === "production";

// Browser launch (UA, args, stealth) is handled by the browser fixture, not here.
export default defineConfig({
  testDir: "./src",
  timeout: 10 * 60 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: isProduction,
  retries: 0, // rapid retries worsen bot detection
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
