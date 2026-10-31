import { type Page } from "@playwright/test";

const TURNSTILE_FRAME_URL_PATTERN = /challenges\.cloudflare\.com/;
const TOKEN_INPUT_SELECTOR = "input[name='botProtectionResponse']";
const MIN_TOKEN_LENGTH = 20;

// Checkbox center, relative to the ~300x65px iframe's top-left corner.
const CHECKBOX_OFFSET_X = 30;
const CHECKBOX_OFFSET_Y = 32;
// The config sets actionTimeout to 0 (no limit). Without this bound a click on an empty or hidden widget would wait forever.
const CHECKBOX_CLICK_TIMEOUT_MS = 10_000;

export type TurnstileTimings = {
  frameAppearTimeoutMs: number;
  framePollIntervalMs: number;
  tokenPollTimeoutMs: number;
  tokenPollIntervalMs: number;
  // The iframe URL shows up before the checkbox inside it has rendered; a click that early lands on
  // nothing. Give the widget time to render (and to auto-issue a token) before clicking, then retry.
  widgetSettleMs: number;
  clickAttempts: number;
  tokenPollAfterClickMs: number;
};

export const DEFAULT_TURNSTILE_TIMINGS: TurnstileTimings = {
  frameAppearTimeoutMs: 15_000,
  framePollIntervalMs: 250,
  tokenPollTimeoutMs: 30_000,
  tokenPollIntervalMs: 500,
  widgetSettleMs: 3_000,
  clickAttempts: 3,
  tokenPollAfterClickMs: 10_000,
};

// No solver here — relies on Patchright's stealth to get an auto-issued token; the managed
// click below is just a fallback. Never throws; failures surface as false for the caller to poll on.
export class TurnstileService {
  private readonly timings: TurnstileTimings;

  constructor(
    private readonly page: Page,
    timings: Partial<TurnstileTimings> = {},
  ) {
    this.timings = { ...DEFAULT_TURNSTILE_TIMINGS, ...timings };
  }

  // page.frames() over a selector probe: Turnstile's iframe lives in a closed shadow DOM.
  async isPresent(): Promise<boolean> {
    return this.page.frames().some(frame => TURNSTILE_FRAME_URL_PATTERN.test(frame.url()));
  }

  async hasToken(): Promise<boolean> {
    try {
      const value = await this.page.locator(TOKEN_INPUT_SELECTOR).first().inputValue({ timeout: 1_000 });
      return value.length > MIN_TOKEN_LENGTH;
    } catch {
      return false;
    }
  }

  async solveIfPresent(): Promise<boolean> {
    try {
      if (await this.hasToken()) {
        console.log("Turnstile token already present — skipping managed click.");
        return true;
      }

      if (!(await this.waitForTurnstileFrame())) {
        console.warn("Turnstile frame did not appear within the timeout window.");
        return false;
      }

      // Frame appeared — let the widget render; Patchright's stealth often gets the token issued meanwhile.
      if (await this.waitForToken(this.timings.widgetSettleMs)) {
        console.log("Turnstile cleared — token auto-issued.");
        return true;
      }

      for (let attempt = 1; attempt <= this.timings.clickAttempts; attempt++) {
        const turnstileFrame = this.page.frames().find(frame => TURNSTILE_FRAME_URL_PATTERN.test(frame.url()));
        if (!turnstileFrame) return false;

        // frame.locator("body").click() lets Playwright scroll the iframe into view automatically
        // and dispatch input events through its own path — avoids the fixed-direction approach
        // movement that manual page.mouse calls produce.
        await turnstileFrame.locator("body").click({
          position: { x: CHECKBOX_OFFSET_X, y: CHECKBOX_OFFSET_Y },
          timeout: CHECKBOX_CLICK_TIMEOUT_MS,
        });

        if (await this.waitForToken(this.timings.tokenPollAfterClickMs)) {
          console.log("Turnstile cleared — token issued.");
          return true;
        }
        console.warn(`Turnstile click ${attempt}/${this.timings.clickAttempts} did not yield a token.`);
      }
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Turnstile solveIfPresent failed: ${message}`);
      return false;
    }
  }

  private waitForTurnstileFrame(): Promise<boolean> {
    return this.pollUntil(() => this.isPresent(), this.timings.frameAppearTimeoutMs, this.timings.framePollIntervalMs);
  }

  waitForToken(timeoutMs = this.timings.tokenPollTimeoutMs): Promise<boolean> {
    return this.pollUntil(() => this.hasToken(), timeoutMs, this.timings.tokenPollIntervalMs);
  }

  private async pollUntil(predicate: () => Promise<boolean>, timeoutMs: number, intervalMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) {
        return true;
      }
      await this.page.waitForTimeout(intervalMs);
    }
    return false;
  }
}
