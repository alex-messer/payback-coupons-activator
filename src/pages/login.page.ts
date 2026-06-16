import { type Page } from "@playwright/test";
import { TurnstileService } from "../services/turnstile.service";

const BASE_URL = "https://www.payback.de";
const LOGIN_PATH = "/login";
const CAPTCHA_TIMEOUT = 120_000;
const LOGIN_TIMEOUT = 5 * 60 * 1_000;
const POST_CAPTCHA_DELAY = 2_000;
const RELOAD_CHECK_INTERVAL = 1_000;
const POST_SOLVE_SETTLE_TIMEOUT = 10_000;

const TURNSTILE_FAILED_MESSAGE =
  "Cloudflare Turnstile konnte nicht gelöst werden — die Session wurde von Cloudflare als Bot eingestuft.";

const Selectors = {
  acceptAllCooies: "#onetrust-accept-btn-handler",
  emailOrId: "E-Mail oder Kundennummer",
  passwordInput: "input[type='password']",
  weiterButton: "Weiter",
  einloggenButton: "Einloggen",
} as const;

export class LoginPage {
  private readonly turnstile: TurnstileService;

  constructor(private readonly page: Page) {
    this.turnstile = new TurnstileService(page);
  }

  async navigate(): Promise<void> {
    await this.page.goto(`${BASE_URL}${LOGIN_PATH}`);
  }

  async dismissCookieConsent(): Promise<void> {
    await this.page.locator(Selectors.acceptAllCooies).click();
  }

  async login(emailOrId: string, password: string): Promise<void> {
    await this.fillIdentification(emailOrId);
    await this.solveTurnstileAndSubmit();
    await this.waitForPasswordStep(emailOrId);
    await this.page.waitForTimeout(POST_CAPTCHA_DELAY);

    // Solve any Turnstile that PayBack may inject on the password step before
    // filling — the submit button stays disabled until the token is present.
    await this.turnstile.solveIfPresent();

    const passwordField = this.page.locator(Selectors.passwordInput);
    await passwordField.pressSequentially(password, { delay: 50 });
    // The password step does NOT submit on Enter; it requires clicking the
    // "Einloggen" button (mirrors the "Weiter" click on the identification step).
    await this.page.getByRole("button", { name: Selectors.einloggenButton }).click();

    await this.waitForLoginComplete();
  }

  /**
   * Fill the email/customer-id field but do NOT advance. PayBack mounts the
   * Turnstile widget after the field blurs (or Enter is pressed in
   * `solveTurnstileAndSubmit`), so we keep the keystroke out of the
   * identification step itself.
   */
  private async fillIdentification(emailOrId: string): Promise<void> {
    const emailField = this.page.getByRole("textbox", { name: Selectors.emailOrId });
    await emailField.fill(emailOrId);
  }

  /**
   * Trigger Turnstile by pressing Enter on the email field, let
   * TurnstileService run its managed click, then click "Weiter" to advance
   * to the password step.
   *
   * Throws a German user-facing error when the managed click fails — German
   * is the project's conversational language and this is the only place a
   * hard failure surfaces to the operator.
   */
  private async solveTurnstileAndSubmit(): Promise<void> {
    const emailField = this.page.getByRole("textbox", { name: Selectors.emailOrId });
    await emailField.press("Enter");

    const solved = await this.turnstile.solveIfPresent();
    if (!solved) {
      throw new Error(TURNSTILE_FAILED_MESSAGE);
    }

    await this.page.getByRole("button", { name: Selectors.weiterButton }).click();
  }

  private async waitForPasswordStep(emailOrId: string): Promise<void> {
    const passwordField = this.page.locator(Selectors.passwordInput);
    const deadline = Date.now() + CAPTCHA_TIMEOUT;

    // Poll until the password field appears. When Turnstile re-appears on
    // this step (observed when the first solve gets retried server-side),
    // run the managed click again.
    while (Date.now() < deadline) {
      if (await passwordField.isVisible().catch(() => false)) {
        return;
      }

      if (await this.turnstile.isPresent()) {
        const solved = await this.turnstile.solveIfPresent();
        if (solved) {
          // Wait for the password step to appear instead of a fixed delay.
          // The old frame may still be attached mid-navigation; jumping
          // straight back to turnstile.isPresent() produced
          // "Execution context was destroyed" in the past.
          await passwordField.waitFor({ state: "visible", timeout: POST_SOLVE_SETTLE_TIMEOUT }).catch(() => {});
          continue;
        }
      }

      // If the page reloaded (Turnstile failed), the email field is empty —
      // re-fill it. We do NOT press Enter here because the next loop tick
      // will detect Turnstile (or not) and decide what to do.
      const emailField = this.page.getByRole("textbox", { name: Selectors.emailOrId });
      if (await emailField.isVisible().catch(() => false)) {
        const value = await emailField.inputValue().catch(() => "");
        if (value === "") {
          await this.fillIdentification(emailOrId);
        }
      }

      await this.page.waitForTimeout(RELOAD_CHECK_INTERVAL);
    }

    throw new Error("Timeout waiting for password step — was Turnstile solved?");
  }

  // Poll for login completion (URL leaves /login) while also handling any
  // Turnstile widget that PayBack may inject on the password step. The plain
  // waitForURL used previously had no captcha handling and would hit
  // LOGIN_TIMEOUT whenever a second challenge appeared.
  private async waitForLoginComplete(): Promise<void> {
    const deadline = Date.now() + LOGIN_TIMEOUT;

    while (Date.now() < deadline) {
      if (!this.isOnLoginPath()) {
        return;
      }

      if (await this.turnstile.isPresent()) {
        const solved = await this.turnstile.solveIfPresent();
        if (solved) {
          await this.page
            .waitForURL(url => !url.pathname.startsWith(LOGIN_PATH), { timeout: POST_SOLVE_SETTLE_TIMEOUT })
            .catch(() => {});
          continue;
        }
      }

      await this.page.waitForTimeout(RELOAD_CHECK_INTERVAL);
    }

    throw new Error(
      `Timeout waiting for login to complete — post-password Turnstile or 2FA? Last URL: ${this.page.url()}`,
    );
  }

  private isOnLoginPath(): boolean {
    try {
      return new URL(this.page.url()).pathname.startsWith(LOGIN_PATH);
    } catch {
      return true;
    }
  }
}
