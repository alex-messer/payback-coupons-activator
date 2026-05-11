import { type Page } from "@playwright/test";
import { solve as recaptchaSolve } from "recaptcha-solver";

const SOLVE_OPTIONS = {
  // Small human-like delay between interactions (ms)
  delay: 64,
  // Max time to wait for the audio challenge to load (ms)
  wait: 15_000,
  // Retry attempts before giving up
  retry: 3,
} as const;

const TOKEN_SELECTOR = "#g-recaptcha-response, textarea[name='g-recaptcha-response']";
// The reCAPTCHA challenge popup iframe (audio/visual challenge). The
// "protected by reCAPTCHA" badge iframe is a DIFFERENT element and is
// always present on captcha-protected pages even when no challenge is open.
const CHALLENGE_FRAME_SELECTOR =
  "iframe[src^='https://www.google.com/recaptcha/api2/bframe'], " +
  "iframe[src^='https://www.google.com/recaptcha/enterprise/bframe']";
const PRESENCE_CHECK_TIMEOUT = 2_000;
// Hard upper bound for one solve attempt. Without this, recaptcha-solver's
// internal `waitForSelector(bframe)` inherits the page's actionTimeout (0 in
// our config) and can hang indefinitely when no challenge popup is open.
const SOLVE_HARD_TIMEOUT = 60_000;

/**
 * Handles Google reCAPTCHA v2 challenges using an offline audio solver
 * (Vosk speech-to-text). No external API keys required.
 *
 * Dependencies:
 * - `ffmpeg` binary available on PATH
 * - `recaptcha-solver` package (ships a ~40 MB acoustic model)
 *
 * Behavior:
 * - `isPresent()` returns true only when a challenge popup iframe is visible
 *   (NOT just the "protected by reCAPTCHA" badge)
 * - `solveIfPresent()` returns true if a token is already set OR was obtained
 *   by solving. Returns false (without throwing) on any failure so that the
 *   caller's polling loop keeps trying.
 */
export class CaptchaService {
  constructor(private readonly page: Page) {}

  /**
   * True if a reCAPTCHA challenge popup iframe is visible.
   *
   * Note: `recaptcha-solver`'s `exists()` has a bug (missing await on
   * `page.$()`) and always returns a truthy Promise. We probe the actual
   * challenge frame ourselves with a short bounded timeout.
   */
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

  /**
   * True if a g-recaptcha-response token is already populated, meaning the
   * captcha is effectively solved and no audio challenge is needed.
   */
  private async hasToken(): Promise<boolean> {
    try {
      const token = await this.page.locator(TOKEN_SELECTOR).first().inputValue({ timeout: 1_000 });
      return token.length > 20;
    } catch {
      return false;
    }
  }

  /**
   * Attempts to solve a present reCAPTCHA.
   * Returns true on success, false if no captcha present or solve failed.
   * Never throws — captcha solving is best-effort.
   */
  async solveIfPresent(): Promise<boolean> {
    if (!(await this.isPresent())) {
      return false;
    }

    // Fast path: a token may already be set if the user passed without challenge.
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
      // "No reCAPTCHA detected" can be a transient state (challenge frame
      // hadn't loaded yet) — don't treat it as fatal.
      if (message.includes("No reCAPTCHA detected")) {
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
