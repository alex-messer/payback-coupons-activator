import { test as base, type Browser, type BrowserContext } from "@playwright/test";
import { Camoufox, type LaunchOptions as CamoufoxLaunchOptions } from "camoufox-js";

// Patch `navigator.webdriver` to false. Camoufox already handles most
// fingerprint signals at the C++ patch level, but we keep this init script
// as a defensive belt-and-suspenders against any leakage at the JS layer.
const hideWebdriverFlag = () => {
  Object.defineProperty(Navigator.prototype, "webdriver", {
    get: () => false,
    configurable: true,
  });
};

/**
 * Camoufox launch options used by the worker-scoped browser fixture.
 *
 * - `os: "linux"` matches both the WSL host and the Debian Docker container,
 *   keeping the fingerprint consistent with the actual kernel and UA.
 * - `humanize: 1.2` bounds the synthetic cursor travel to at most 1.2 s. Long
 *   travel paths read as more human; the upper bound keeps test runs snappy.
 * - `window: [1280, 720]` pins the viewport so screenshots are reproducible
 *   and the fingerprint doesn't randomize per launch.
 * - `block_webrtc: true` prevents the public-IP leak that Cloudflare bot
 *   detection uses to correlate sessions across cookies.
 * - `locale` is INTENTIONALLY omitted. camoufox-js v0.10.x has a known bug
 *   where passing `locale: [...]` triggers
 *   `TypeError: Cannot read properties of undefined (reading 'territoryInfo')`
 *   inside `StatisticalLocaleSelector`. Omitting it falls back to Camoufox's
 *   default locale picker, which is bug-free.
 */
const camoufoxLaunchOptions = (): CamoufoxLaunchOptions => ({
  headless: process.env.mode === "production",
  os: "linux",
  humanize: 1.2,
  window: [1280, 720],
  block_webrtc: true,
});

/**
 * Playwright test fixture that launches Camoufox — a Firefox fork with C++
 * level fingerprint injection designed to clear Cloudflare Turnstile and
 * other anti-bot systems. Replaces the previous Firefox/Chromium launch:
 * Camoufox's residential-Firefox fingerprint is closer to a real browser
 * install than anything assemble-able with stealth init scripts.
 */
export const test = base.extend<{ context: BrowserContext }, { browser: Browser }>({
  browser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const browser = (await Camoufox(camoufoxLaunchOptions())) as Browser;
      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
  context: async ({ browser }, use) => {
    // Camoufox owns the userAgent through the generated fingerprint; do not
    // override it here or we'd reintroduce a UA / fingerprint mismatch.
    const context = await browser.newContext();
    await context.addInitScript(hideWebdriverFlag);
    await use(context);
    await context.close();
  },
});
