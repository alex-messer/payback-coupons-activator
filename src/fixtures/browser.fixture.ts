import { test as base, type Browser, firefox } from "@playwright/test";

// Firefox uses about:config-style preferences rather than Chromium CLI flags
// for anti-automation tweaks. `puppeteer-extra-plugin-stealth` was authored
// for Chromium and crashes on Firefox (user-agent-override evasion in
// particular), so we no longer register it here — Firefox's defaults plus
// these prefs are what we rely on for fingerprint hardening.
const FIREFOX_USER_PREFS = {
  "dom.webdriver.enabled": false,
  useAutomationExtension: false,
  "general.useragent.override": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
} as const;

/**
 * Playwright test fixture that launches Firefox with anti-automation prefs.
 * Switched from Chromium because payback.de's reCAPTCHA was scoring Chromium
 * sessions too aggressively even with stealth evasions applied.
 */
export const test = base.extend<object, { browser: Browser }>({
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
});
