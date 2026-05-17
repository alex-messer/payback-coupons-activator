import { test as base, type Browser, type BrowserContext, firefox } from "@playwright/test";

// UA pinned to the Firefox version that Playwright 1.60.x bundles (Firefox 150).
// Keep this in sync with the Playwright pin in package.json and Dockerfile — a UA
// that disagrees with the actual build is itself a detectable fingerprint signal.
const FIREFOX_USER_PREFS = {
  "general.useragent.override": "Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0",
} as const;

// Playwright ≥1.60 correctly exposes `navigator.webdriver === true` for Firefox
// (the prior quirk that hid it was treated as a bug — see microsoft/playwright#31039).
// `dom.webdriver.enabled` was removed in Firefox 88, so the historical pref-based
// hide no longer exists. We patch the property per-context with an init script.
const hideWebdriverFlag = () => {
  Object.defineProperty(Navigator.prototype, "webdriver", {
    get: () => false,
    configurable: true,
  });
};

/**
 * Playwright test fixture that launches Firefox with anti-automation tweaks.
 * Switched from Chromium because payback.de's reCAPTCHA was scoring Chromium
 * sessions too aggressively even with stealth evasions applied.
 */
export const test = base.extend<{ context: BrowserContext }, { browser: Browser }>({
  browser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const browser = await firefox.launch({
        headless: process.env.mode === "production",
        firefoxUserPrefs: FIREFOX_USER_PREFS,
      });
      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
  context: async ({ browser }, use) => {
    const context = await browser.newContext();
    await context.addInitScript(hideWebdriverFlag);
    await use(context);
    await context.close();
  },
});
