import { test as base, type Browser, type BrowserContext, chromium } from "@playwright/test";

// Linux Chrome UA matching the Chromium build Playwright 1.60.x bundles.
// Must stay consistent with the actual binary — a UA that disagrees with the
// underlying browser is itself a detectable fingerprint signal.
const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Patch `navigator.webdriver` to false. Playwright sets it to true by default;
// the Firefox prefs-only hide does not work in Chromium, we use an init script.
const hideWebdriverFlag = () => {
  Object.defineProperty(Navigator.prototype, "webdriver", {
    get: () => false,
    configurable: true,
  });
};

/**
 * Playwright test fixture that launches Chromium with anti-automation tweaks.
 * `--disable-blink-features=AutomationControlled` removes the most prominent
 * `navigator.webdriver` signal at the Blink level; the init script handles
 * the per-context property.
 */
export const test = base.extend<{ context: BrowserContext }, { browser: Browser }>({
  browser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const browser = await chromium.launch({
        headless: process.env.mode === "production",
        args: ["--disable-blink-features=AutomationControlled"],
      });
      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
  context: async ({ browser }, use) => {
    const context = await browser.newContext({ userAgent: CHROME_UA });
    await context.addInitScript(hideWebdriverFlag);
    await use(context);
    await context.close();
  },
});
