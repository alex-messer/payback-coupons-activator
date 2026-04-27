import { expect } from "@playwright/test";
import { test } from "../fixtures/stealth.fixture";

/**
 * Smoke test: verify that the stealth fixture suppresses the most common
 * bot-detection signals.
 *
 * Source page: https://bot.sannysoft.com/ — runs ~30 fingerprint checks
 * (WebDriver, Chrome, Permissions, Plugins, Languages, WebGL, etc.).
 *
 * We don't aim for 100% pass — modern stealth typically clears the
 * Chrome / WebDriver / Permissions / Plugins / Languages checks; iframe and
 * advanced fingerprint checks may still fail.
 */
test("stealth fixture clears core bot-detection checks", async ({ page }) => {
  await page.goto("https://bot.sannysoft.com/", { waitUntil: "networkidle" });

  // navigator.webdriver should be undefined or false — the single most
  // important signal Playwright leaks by default.
  const webdriver = await page.evaluate(() => navigator.webdriver);
  expect(webdriver, "navigator.webdriver should be falsy").toBeFalsy();

  // navigator.plugins should not be empty (real browsers have plugins).
  const pluginsLength = await page.evaluate(() => navigator.plugins.length);
  expect(pluginsLength, "navigator.plugins should not be empty").toBeGreaterThan(0);

  // navigator.languages should be a non-empty array.
  const languages = await page.evaluate(() => navigator.languages);
  expect(Array.isArray(languages) && languages.length > 0, "navigator.languages should be set").toBe(true);

  // Persist a screenshot so a human can eyeball the full results matrix.
  await page.screenshot({ path: "test-results/sannysoft.png", fullPage: true });
});
