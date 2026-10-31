import { type Page } from "@playwright/test";
import { TurnstileService, type TurnstileTimings } from "../services/turnstile.service";

const BASE_URL = "https://www.payback.de";
const LOGIN_PATH = "/login";

export type LoginTimings = {
  captchaTimeoutMs: number;
  loginTimeoutMs: number;
  postCaptchaDelayMs: number;
  reloadCheckIntervalMs: number;
  postSolveSettleMs: number;
  homepageDwellMs: number;
  cookieClickTimeoutMs: number;
};

export const DEFAULT_LOGIN_TIMINGS: LoginTimings = {
  captchaTimeoutMs: 2 * 60 * 1_000,
  loginTimeoutMs: 5 * 60 * 1_000,
  postCaptchaDelayMs: 2_000,
  reloadCheckIntervalMs: 1_000,
  postSolveSettleMs: 10_000,
  homepageDwellMs: 1_500,
  cookieClickTimeoutMs: 5_000,
};

export type LoginOptions = {
  baseUrl?: string;
  timings?: Partial<LoginTimings>;
  turnstileTimings?: Partial<TurnstileTimings>;
};

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
  private readonly timings: LoginTimings;
  private readonly baseUrl: string;

  constructor(
    private readonly page: Page,
    private readonly onManualTurnstileRequired?: () => Promise<void>,
    options: LoginOptions = {},
  ) {
    this.timings = { ...DEFAULT_LOGIN_TIMINGS, ...options.timings };
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.turnstile = new TurnstileService(page, options.turnstileTimings);
  }

  async navigate(): Promise<void> {
    // Brief homepage visit before login so the session has some browsing history,
    // which improves Cloudflare's trust score for the Turnstile widget.
    await this.page.goto(this.baseUrl);
    await this.page.waitForTimeout(this.timings.homepageDwellMs);
    await this.page.goto(`${this.baseUrl}${LOGIN_PATH}`);
  }

  async dismissCookieConsent(): Promise<void> {
    // May not appear if already accepted in a previous run (persistent profile).
    await this.page
      .locator(Selectors.acceptAllCooies)
      .click({ timeout: this.timings.cookieClickTimeoutMs })
      .catch(() => {});
  }

  async login(emailOrId: string, password: string): Promise<void> {
    // Persistent profile may carry a still-valid PayBack session.
    if (!this.isOnLoginPath()) {
      console.log("Session still active from previous run — skipping login.");
      return;
    }

    await this.fillIdentification(emailOrId);
    await this.solveTurnstileAndSubmit();
    await this.waitForPasswordStep(emailOrId);
    await this.page.waitForTimeout(this.timings.postCaptchaDelayMs);

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
      console.warn("Automated Turnstile solve failed — solve the challenge in the browser window to continue.");
      await this.onManualTurnstileRequired?.();
      if (!(await this.turnstile.waitForToken(this.timings.captchaTimeoutMs))) {
        throw new Error(TURNSTILE_FAILED_MESSAGE);
      }
    }

    await this.page.getByRole("button", { name: Selectors.weiterButton }).click();
  }

  private async waitForPasswordStep(emailOrId: string): Promise<void> {
    const passwordField = this.page.locator(Selectors.passwordInput);
    const deadline = Date.now() + this.timings.captchaTimeoutMs;

    while (Date.now() < deadline) {
      if (await passwordField.isVisible().catch(() => false)) {
        return;
      }

      if (await this.turnstile.isPresent()) {
        const solved = await this.turnstile.solveIfPresent();
        if (solved) {
          await passwordField.waitFor({ state: "visible", timeout: this.timings.postSolveSettleMs }).catch(() => {});
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

      await this.page.waitForTimeout(this.timings.reloadCheckIntervalMs);
    }

    throw new Error("Timeout waiting for password step — was Turnstile solved?");
  }

  // Polls until URL leaves /login, handling any Turnstile that appears on the password step too.
  private async waitForLoginComplete(): Promise<void> {
    const deadline = Date.now() + this.timings.loginTimeoutMs;

    while (Date.now() < deadline) {
      if (!this.isOnLoginPath()) {
        return;
      }

      if (await this.turnstile.isPresent()) {
        const solved = await this.turnstile.solveIfPresent();
        if (solved) {
          await this.page
            .waitForURL(url => !url.pathname.startsWith(LOGIN_PATH), { timeout: this.timings.postSolveSettleMs })
            .catch(() => {});
          continue;
        }
      }

      await this.page.waitForTimeout(this.timings.reloadCheckIntervalMs);
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
