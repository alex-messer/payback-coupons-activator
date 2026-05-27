import { type Page } from "@playwright/test";

const TURNSTILE_FRAME_URL_PATTERN = /challenges\.cloudflare\.com/;
const TOKEN_INPUT_SELECTOR = "input[name='botProtectionResponse']";
const MIN_TOKEN_LENGTH = 20;

// Where in the Turnstile iframe the checkbox actually sits, measured from the
// iframe's top-left corner. The widget is ~300x65 px, with the box in the
// upper-left. These coordinates land roughly on the centre of the checkbox.
const CHECKBOX_OFFSET_X = 30;
const CHECKBOX_OFFSET_Y = 32;
// Where the cursor "approaches from" before the click — well outside the
// iframe so the move traces a non-trivial path. Pixel distance is arbitrary;
// the value just needs to look unlike a teleport.
const CURSOR_APPROACH_OFFSET = 80;
const MOUSE_MOVE_STEPS = 24;
const PRE_MOVE_DELAY_MS = 120;
const PRE_CLICK_DELAY_MS = 180;

const FRAME_APPEAR_TIMEOUT_MS = 15_000;
const FRAME_POLL_INTERVAL_MS = 250;
const TOKEN_POLL_TIMEOUT_MS = 30_000;
const TOKEN_POLL_INTERVAL_MS = 500;

/**
 * Detects Cloudflare Turnstile challenges and attempts to clear them via a
 * managed human-like click on the checkbox. Unlike `CaptchaService` (offline
 * reCAPTCHA audio solver), this service has NO solver. The strategy is:
 *
 *   Camoufox's residential Firefox fingerprint → Cloudflare scores us as
 *   trustworthy → a single managed click on the Turnstile checkbox is enough
 *   to issue a token. If Cloudflare still thinks we're a bot, no click
 *   pattern will help and the service surfaces a failure.
 *
 * Never throws — all failures are swallowed and surfaced as a boolean so the
 * caller's polling loop can react instead of crashing.
 */
export class TurnstileService {
  constructor(private readonly page: Page) {}

  /**
   * True if any frame in the page tree was loaded from the Cloudflare
   * challenge platform. `page.frames()` is preferred over a selector probe
   * because Turnstile's iframe lives inside a closed shadow DOM that
   * `document.querySelectorAll` cannot reach.
   */
  async isPresent(): Promise<boolean> {
    return this.page.frames().some(frame => TURNSTILE_FRAME_URL_PATTERN.test(frame.url()));
  }

  /**
   * True if the hidden `botProtectionResponse` input has a non-empty token
   * value. A populated value means Turnstile has already issued a token and
   * no further interaction is needed.
   */
  async hasToken(): Promise<boolean> {
    try {
      const value = await this.page.locator(TOKEN_INPUT_SELECTOR).first().inputValue({ timeout: 1_000 });
      return value.length > MIN_TOKEN_LENGTH;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to clear a Turnstile challenge:
   *
   *   1. Short-circuit if a token is already present.
   *   2. Wait up to FRAME_APPEAR_TIMEOUT_MS for the Turnstile frame to mount.
   *   3. Compute the checkbox screen position from the frame's bounding box.
   *   4. Move the cursor from a point outside the box to the target in many
   *      small steps so it traces a path that looks like a human flick rather
   *      than a teleport — both Camoufox's humanize layer and Cloudflare's
   *      pointer-event heuristics expect a non-instant motion.
   *   5. Click, then poll up to TOKEN_POLL_TIMEOUT_MS for the token input.
   *
   * Returns true if a token was issued, false otherwise. Never throws.
   */
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

  /**
   * Locate the first Turnstile iframe element and return its bounding box.
   * The iframe is owned by the host page (the *contents* are in a closed
   * shadow DOM, but the iframe element itself is queryable from the page).
   */
  private async locateCheckboxCenter(): Promise<{ x: number; y: number } | null> {
    const turnstileFrame = this.page.frames().find(frame => TURNSTILE_FRAME_URL_PATTERN.test(frame.url()));
    if (!turnstileFrame) return null;

    const frameElement = await turnstileFrame.frameElement().catch(() => null);
    if (!frameElement) return null;

    const box = await frameElement.boundingBox().catch(() => null);
    if (!box) return null;

    return {
      x: box.x + CHECKBOX_OFFSET_X,
      y: box.y + CHECKBOX_OFFSET_Y,
    };
  }

  /**
   * Approximate a human mouse motion: hover near the target, pause briefly,
   * then move along a polyline to the click point and click. The exact step
   * count and pauses are conservative — too snappy reads as automation, too
   * slow burns the FRAME_APPEAR_TIMEOUT before the click lands.
   */
  private async performHumanClick(x: number, y: number): Promise<void> {
    const approachX = Math.max(0, x - CURSOR_APPROACH_OFFSET);
    const approachY = Math.max(0, y - CURSOR_APPROACH_OFFSET);

    await this.page.mouse.move(approachX, approachY);
    await this.page.waitForTimeout(PRE_MOVE_DELAY_MS);
    await this.page.mouse.move(x, y, { steps: MOUSE_MOVE_STEPS });
    await this.page.waitForTimeout(PRE_CLICK_DELAY_MS);
    await this.page.mouse.click(x, y);
  }

  private async waitForTurnstileFrame(): Promise<boolean> {
    const deadline = Date.now() + FRAME_APPEAR_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.isPresent()) {
        return true;
      }
      await this.page.waitForTimeout(FRAME_POLL_INTERVAL_MS);
    }
    return false;
  }

  private async waitForToken(): Promise<boolean> {
    const deadline = Date.now() + TOKEN_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.hasToken()) {
        return true;
      }
      await this.page.waitForTimeout(TOKEN_POLL_INTERVAL_MS);
    }
    return false;
  }
}
