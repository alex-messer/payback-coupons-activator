import { type Page } from "@playwright/test";
import { solve as recaptchaSolve } from "recaptcha-solver";

const SOLVE_OPTIONS = {
  delay: 64, // ms between interactions
  wait: 15_000, // ms to wait for audio challenge to load
  retry: 3,
} as const;

const TOKEN_SELECTOR = "#g-recaptcha-response, textarea[name='g-recaptcha-response']";
// Challenge popup iframe only — distinct from the always-present "protected by reCAPTCHA" badge iframe.
const CHALLENGE_FRAME_SELECTOR =
  "iframe[src^='https://www.google.com/recaptcha/api2/bframe'], " +
  "iframe[src^='https://www.google.com/recaptcha/enterprise/bframe']";
const PRESENCE_CHECK_TIMEOUT = 2_000;
// actionTimeout is 0 in our config, so bound recaptcha-solver's internal waitForSelector ourselves.
const SOLVE_HARD_TIMEOUT = 60_000;

// Offline reCAPTCHA v2 solver via Vosk audio speech-to-text (no API keys).
export class CaptchaService {
  constructor(private readonly page: Page) {}

  // recaptcha-solver's exists() is buggy (missing await), so we probe the challenge frame ourselves.
  async isPresent(): Promise<boolean> {
    try {
      await this.page
        .locator(CHALLENGE_FRAME_SELECTOR)
        .first()
        .waitFor({ state: "visible", timeout: PRESENCE_CHECK_TIMEOUT });
      return true;
    } catch {
      return false;
    }
  }

  private async hasToken(): Promise<boolean> {
    try {
      const token = await this.page.locator(TOKEN_SELECTOR).first().inputValue({ timeout: 1_000 });
      return token.length > 20;
    } catch {
      return false;
    }
  }

  async solveIfPresent(): Promise<boolean> {
    if (!(await this.isPresent())) {
      return false;
    }

    if (await this.hasToken()) {
      console.log("reCAPTCHA token already present — skipping solve.");
      return true;
    }

    console.log("reCAPTCHA detected — attempting to solve via audio challenge...");

    try {
      const ok = await this.solveWithHardTimeout();
      if (ok) {
        console.log("reCAPTCHA solved.");
        return true;
      }
      console.warn("reCAPTCHA solve returned false (challenge could not be cleared).");
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No reCAPTCHA detected")) {
        // transient — frame may not have loaded yet
        console.warn(`reCAPTCHA solver could not engage challenge frame: ${message}`);
      } else {
        console.error(`reCAPTCHA solve failed: ${message}`);
      }
      return false;
    }
  }

  private async solveWithHardTimeout(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("solve hard-timeout reached")), SOLVE_HARD_TIMEOUT);
    });
    try {
      return await Promise.race([recaptchaSolve(this.page, SOLVE_OPTIONS), timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
