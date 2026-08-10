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

    await this.turnstile.solveIfPresent(); // submit button stays disabled without a token

    const passwordField = this.page.locator(Selectors.passwordInput);
    await passwordField.pressSequentially(password, { delay: 50 });
    await this.page.getByRole("button", { name: Selectors.einloggenButton }).click(); // Enter does not submit here

    await this.waitForLoginComplete();
  }

  // Fills but doesn't submit — PayBack mounts Turnstile only after Enter (see solveTurnstileAndSubmit).
  private async fillIdentification(emailOrId: string): Promise<void> {
    const emailField = this.page.getByRole("textbox", { name: Selectors.emailOrId });
    await emailField.fill(emailOrId);
  }

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

    while (Date.now() < deadline) {
      if (await passwordField.isVisible().catch(() => false)) {
        return;
      }

      if (await this.turnstile.isPresent()) {
        const solved = await this.turnstile.solveIfPresent();
        if (solved) {
          await passwordField.waitFor({ state: "visible", timeout: POST_SOLVE_SETTLE_TIMEOUT }).catch(() => {});
          continue;
        }
      }

      // page reloaded (Turnstile failed) → re-fill the now-empty email field, no Enter
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

  // Polls until URL leaves /login, handling any Turnstile that appears on the password step too.
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
