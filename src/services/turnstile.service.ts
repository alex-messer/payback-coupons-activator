import { type Page } from "@playwright/test";

const TURNSTILE_FRAME_URL_PATTERN = /challenges\.cloudflare\.com/;
const TOKEN_INPUT_SELECTOR = "input[name='botProtectionResponse']";
const MIN_TOKEN_LENGTH = 20;

// Checkbox center, relative to the ~300x65px iframe's top-left corner.
const CHECKBOX_OFFSET_X = 30;
const CHECKBOX_OFFSET_Y = 32;
const CURSOR_APPROACH_OFFSET = 80; // px the cursor starts from before moving to the click point
const MOUSE_MOVE_STEPS = 24;
const PRE_MOVE_DELAY_MS = 120;
const PRE_CLICK_DELAY_MS = 180;

const FRAME_APPEAR_TIMEOUT_MS = 15_000;
const FRAME_POLL_INTERVAL_MS = 250;
const TOKEN_POLL_TIMEOUT_MS = 30_000;
const TOKEN_POLL_INTERVAL_MS = 500;

// No solver here — relies on Patchright's stealth to get an auto-issued token; the managed
// click below is just a fallback. Never throws; failures surface as false for the caller to poll on.
export class TurnstileService {
  constructor(private readonly page: Page) {}

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

      const clickTarget = await this.locateCheckboxCenter();
      if (!clickTarget) {
        console.warn("Could not determine Turnstile checkbox coordinates from frame bounding box.");
        return false;
      }

      await this.performHumanClick(clickTarget.x, clickTarget.y);

      const ok = await this.waitForToken();
      if (ok) {
        console.log("Turnstile cleared — token issued.");
        return true;
      }
      console.warn("Turnstile click completed but no token was issued within the polling window.");
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Turnstile solveIfPresent failed: ${message}`);
      return false;
    }
  }

  private async locateCheckboxCenter(): Promise<{ x: number; y: number } | null> {
    const turnstileFrame = this.page.frames().find(frame => TURNSTILE_FRAME_URL_PATTERN.test(frame.url()));
    if (!turnstileFrame) return null;

    let box: { x: number; y: number; width: number; height: number } | null = null;

    // frameElement() is null in Chromium — the iframe sits in a closed shadow DOM there.
    const frameElement = await turnstileFrame.frameElement().catch(() => null);
    if (frameElement) {
      box = await frameElement.boundingBox().catch(() => null);
    }

    // fallback: frame's <body> bounding box, already in top-level page coordinates
    if (!box) {
      box = await turnstileFrame
        .locator("body")
        .boundingBox()
        .catch(() => null);
    }

    if (!box) return null;

    return {
      x: box.x + CHECKBOX_OFFSET_X,
      y: box.y + CHECKBOX_OFFSET_Y,
    };
  }

  private async performHumanClick(x: number, y: number): Promise<void> {
    const approachX = Math.max(0, x - CURSOR_APPROACH_OFFSET);
    const approachY = Math.max(0, y - CURSOR_APPROACH_OFFSET);

    await this.page.mouse.move(approachX, approachY);
    await this.page.waitForTimeout(PRE_MOVE_DELAY_MS);
    await this.page.mouse.move(x, y, { steps: MOUSE_MOVE_STEPS });
    await this.page.waitForTimeout(PRE_CLICK_DELAY_MS);
    await this.page.mouse.click(x, y);
  }

  private waitForTurnstileFrame(): Promise<boolean> {
    return this.pollUntil(() => this.isPresent(), FRAME_APPEAR_TIMEOUT_MS, FRAME_POLL_INTERVAL_MS);
  }

  private waitForToken(): Promise<boolean> {
    return this.pollUntil(() => this.hasToken(), TOKEN_POLL_TIMEOUT_MS, TOKEN_POLL_INTERVAL_MS);
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
