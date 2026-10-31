import { test, expect, mockHosts } from "./fixtures/chrome.fixture";
import { CaptchaService } from "../services/captcha.service";

// The audio solve itself needs Google and the Vosk model, so it is covered by the captcha smoke test.
// These tests cover the detection and token paths, which run before any solve is attempted.
const FAST = { presenceCheckTimeoutMs: 300, solveHardTimeoutMs: 5_000 };
const CHALLENGE_FRAME =
  '<iframe src="https://www.google.com/recaptcha/api2/bframe?k=test" width="300" height="200"></iframe>';

test("isPresent is false without a challenge frame", async ({ page }) => {
  await page.setContent("<p>no captcha</p>");

  expect(await new CaptchaService(page, FAST).isPresent()).toBe(false);
});

test("isPresent is true when the reCAPTCHA challenge frame is visible", async ({ page }) => {
  await mockHosts(page, url =>
    url.hostname === "www.google.com" ? { body: "<!doctype html><body>challenge</body>" } : undefined,
  );
  await page.goto("https://www.payback.de/captcha-test");
  await page.setContent(CHALLENGE_FRAME);
  await page.waitForSelector("iframe");

  expect(await new CaptchaService(page, FAST).isPresent()).toBe(true);
});

test("hasToken is true for a g-recaptcha-response longer than 20 characters", async ({ page }) => {
  await page.setContent(`<textarea name="g-recaptcha-response">${"A".repeat(40)}</textarea>`);

  expect(await new CaptchaService(page, FAST).hasToken()).toBe(true);
});

test("hasToken is false for a short or missing g-recaptcha-response", async ({ page }) => {
  await page.setContent('<textarea name="g-recaptcha-response">short</textarea>');
  expect(await new CaptchaService(page, FAST).hasToken()).toBe(false);

  await page.setContent("<p>nothing</p>");
  expect(await new CaptchaService(page, FAST).hasToken()).toBe(false);
});

test("solveIfPresent returns false when no challenge is shown, without attempting a solve", async ({ page }) => {
  await page.setContent("<p>no captcha</p>");

  expect(await new CaptchaService(page, FAST).solveIfPresent()).toBe(false);
});

test("solveIfPresent returns true immediately when a token is already present", async ({ page }) => {
  await mockHosts(page, url =>
    url.hostname === "www.google.com" ? { body: "<!doctype html><body>challenge</body>" } : undefined,
  );
  await page.goto("https://www.payback.de/captcha-test");
  await page.setContent(`${CHALLENGE_FRAME}<textarea name="g-recaptcha-response">${"B".repeat(40)}</textarea>`);
  await page.waitForSelector("iframe");

  expect(await new CaptchaService(page, FAST).solveIfPresent()).toBe(true);
});
