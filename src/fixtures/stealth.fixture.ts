import { test as base, type Browser } from "@playwright/test";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

const LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--no-sandbox",
  "--disable-dev-shm-usage",
];

/**
 * Playwright test fixture that launches a stealthed Chromium browser
 * via `playwright-extra` + `puppeteer-extra-plugin-stealth`.
 *
 * This reduces the likelihood of triggering bot-detection mechanisms
 * (e.g. reCAPTCHA challenges) when running headless or in Docker.
 */
export const test = base.extend<object, { browser: Browser }>({
  browser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const browser = await chromium.launch({
        headless: process.env.mode === "production",
        args: LAUNCH_ARGS,
      });
      await use(browser as Browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
});
