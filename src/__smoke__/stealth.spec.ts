import { expect } from "@playwright/test";
import { test } from "../fixtures/browser.fixture";

/**
 * Smoke test: verify that the browser fixture hides the most common
 * Playwright automation signals from a feature-detection page.
 *
 * Source page: https://bot.sannysoft.com/ — runs ~30 fingerprint checks
 * (WebDriver, WebGL, Languages, etc.). We assert only on the signals our
 * firefoxUserPrefs control; advanced fingerprint checks remain best-effort.
 */
test("browser fixture hides core bot-detection signals", async ({ page }) => {
  await page.goto("https://bot.sannysoft.com/", { waitUntil: "networkidle" });

  // `dom.webdriver.enabled: false` should make navigator.webdriver falsy.
  const webdriver = await page.evaluate(() => navigator.webdriver);
  expect(webdriver, "navigator.webdriver should be falsy").toBeFalsy();

  // navigator.languages should be populated.
  const languages = await page.evaluate(() => navigator.languages);
  expect(Array.isArray(languages) && languages.length > 0, "navigator.languages should be set").toBe(true);

  // Persist a screenshot so a human can eyeball the full results matrix.
  await page.screenshot({ path: "test-results/sannysoft.png", fullPage: true });
});
