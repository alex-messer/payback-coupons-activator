import { expect } from "@playwright/test";
import { test } from "../fixtures/browser.fixture";

test("browser fixture hides core bot-detection signals", async ({ page }) => {
  await page.goto("https://bot.sannysoft.com/", { waitUntil: "networkidle" });

  const webdriver = await page.evaluate(() => navigator.webdriver);
  expect(webdriver, "navigator.webdriver should be falsy").toBeFalsy();

  const languages = await page.evaluate(() => navigator.languages);
  expect(Array.isArray(languages) && languages.length > 0, "navigator.languages should be set").toBe(true);

  await page.screenshot({ path: "test-results/sannysoft.png", fullPage: true });
});
