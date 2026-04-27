import { type Page } from "@playwright/test";
import { CaptchaService } from "../services/captcha.service";

const BASE_URL = "https://www.payback.de";
const LOGIN_PATH = "/login";
const CAPTCHA_TIMEOUT = 120_000;
const LOGIN_TIMEOUT = 5 * 60 * 1_000;
const POST_CAPTCHA_DELAY = 2_000;
const RELOAD_CHECK_INTERVAL = 1_000;

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

    // Wait for the full login flow to complete (including 2FA)
    await this.page.waitForURL(url => !url.pathname.startsWith(LOGIN_PATH), {
      timeout: LOGIN_TIMEOUT,
    });
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
          await this.page.waitForTimeout(POST_CAPTCHA_DELAY);
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
}
