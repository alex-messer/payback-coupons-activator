import { type Page } from "@playwright/test";
import { CaptchaService } from "../services/captcha.service";

const BASE_URL = "https://www.payback.de";
const LOGIN_PATH = "/login";
const CAPTCHA_TIMEOUT = 120_000;
const LOGIN_TIMEOUT = 5 * 60 * 1_000;
const POST_CAPTCHA_DELAY = 2_000;
const RELOAD_CHECK_INTERVAL = 1_000;
const POST_SOLVE_SETTLE_TIMEOUT = 10_000;

const Selectors = {
  acceptAllCooies: "#onetrust-accept-btn-handler",
  emailOrId: "E-Mail oder Kundennummer",
  passwordInput: "input[type='password']",
} as const;

export class LoginPage {
  private readonly captcha: CaptchaService;

  constructor(private readonly page: Page) {
    this.captcha = new CaptchaService(page);
  }

  async navigate(): Promise<void> {
    await this.page.goto(`${BASE_URL}${LOGIN_PATH}`);
  }

  async dismissCookieConsent(): Promise<void> {
    await this.page.locator(Selectors.acceptAllCooies).click();
  }

  async login(emailOrId: string, password: string): Promise<void> {
    await this.fillIdentification(emailOrId);
    await this.waitForPasswordStep(emailOrId);
    await this.page.waitForTimeout(POST_CAPTCHA_DELAY);

    const passwordField = this.page.locator(Selectors.passwordInput);
    await passwordField.fill(password);
    await passwordField.press("Enter");

    await this.waitForLoginComplete();
  }

  private async fillIdentification(emailOrId: string): Promise<void> {
    const emailField = this.page.getByRole("textbox", { name: Selectors.emailOrId });
    await emailField.fill(emailOrId);
    await emailField.press("Enter");
  }

  private async waitForPasswordStep(emailOrId: string): Promise<void> {
    const passwordField = this.page.locator(Selectors.passwordInput);
    const deadline = Date.now() + CAPTCHA_TIMEOUT;

    // Poll until the password field appears. When a CAPTCHA is detected,
    // try to solve it automatically via the offline audio solver.
    while (Date.now() < deadline) {
      if (await passwordField.isVisible().catch(() => false)) {
        return;
      }

      // Auto-solve reCAPTCHA if present
      if (await this.captcha.isPresent()) {
        const solved = await this.captcha.solveIfPresent();
        if (solved) {
          // Wait for the password step to appear instead of a fixed delay.
          // The old frame may still be attached mid-navigation; jumping straight
          // back to captcha.isPresent() produced "Execution context was destroyed".
          await passwordField.waitFor({ state: "visible", timeout: POST_SOLVE_SETTLE_TIMEOUT }).catch(() => {});
          continue;
        }
      }

      // If the page reloaded (CAPTCHA failed), the email field is empty — re-fill it
      const emailField = this.page.getByRole("textbox", { name: Selectors.emailOrId });
      if (await emailField.isVisible().catch(() => false)) {
        const value = await emailField.inputValue().catch(() => "");
        if (value === "") {
          await this.fillIdentification(emailOrId);
        }
      }

      await this.page.waitForTimeout(RELOAD_CHECK_INTERVAL);
    }

    throw new Error("Timeout waiting for password step — was the CAPTCHA solved?");
  }

  // Poll for login completion (URL leaves /login) while also handling any
  // reCAPTCHA that PayBack may inject on the password step. The plain
  // waitForURL used previously had no captcha handling and would hit
  // LOGIN_TIMEOUT whenever a second challenge appeared.
  private async waitForLoginComplete(): Promise<void> {
    const deadline = Date.now() + LOGIN_TIMEOUT;

    while (Date.now() < deadline) {
      if (!this.isOnLoginPath()) {
        return;
      }

      if (await this.captcha.isPresent()) {
        const solved = await this.captcha.solveIfPresent();
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
      `Timeout waiting for login to complete — post-password CAPTCHA or 2FA? Last URL: ${this.page.url()}`,
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
