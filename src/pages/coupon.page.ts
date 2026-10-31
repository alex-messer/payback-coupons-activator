import { type Page } from "@playwright/test";

const BASE_URL = "https://www.payback.de";
const COUPON_PATH = "/coupons";

export type CouponPageOptions = {
  baseUrl?: string;
  // Max wait for a click and for the button to flip to "...-activated". Stuck coupons are skipped after this.
  clickTimeoutMs?: number;
  // Reload the coupon page after this many activations (PayBack stops rendering coupons after many clicks).
  reloadEvery?: number;
};

const DEFAULTS = {
  baseUrl: BASE_URL,
  clickTimeoutMs: 10_000,
  reloadEvery: 50,
} as const;

const Selectors = {
  notActivatedButton: '[data-testid^="coupon-button-"][data-testid$="-not_activated"]',

  noCouponsHeadline: '[data-testid="not-activated-coupons-headline"]',
} as const;

export class CouponPage {
  private readonly options: Required<CouponPageOptions>;

  constructor(
    private readonly page: Page,
    options: CouponPageOptions = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  async navigate(): Promise<void> {
    await this.page.goto(`${this.options.baseUrl}${COUPON_PATH}`);
  }

  // Running total across page reloads; stays readable if activateAllCoupons() throws midway.
  activatedCount = 0;

  // Stops after `limit` activations in this call (the caller then restarts the browser process).
  async activateAllCoupons(limit = Number.POSITIVE_INFINITY): Promise<number> {
    const buttons = this.page.locator(Selectors.notActivatedButton);
    const failed = new Set<string>();
    const startCount = this.activatedCount;
    let activatedSinceReload = 0;

    for (;;) {
      if (this.activatedCount - startCount >= limit) break;

      // PayBack slows down / stops rendering coupons after many clicks, so reload periodically.
      if (activatedSinceReload >= this.options.reloadEvery) {
        console.log(`${this.activatedCount} Coupons aktiviert — lade Seite neu.`);
        await this.navigate();
        activatedSinceReload = 0;
      }

      const ids = await buttons.evaluateAll(els => els.map(el => el.getAttribute("data-testid") ?? ""));
      const nextId = ids.find(id => !failed.has(id));
      if (!nextId) break;

      const selector = `[data-testid="${nextId}"]`;
      try {
        // The same coupon can be rendered more than once (e.g. carousel + list), so target the first match.
        await this.page.locator(selector).first().click({ timeout: this.options.clickTimeoutMs });
        // The button flips to "...-activated" on success; a stuck one stays "not_activated".
        await this.page.waitForSelector(selector, { state: "detached", timeout: this.options.clickTimeoutMs });
        this.activatedCount++;
        activatedSinceReload++;
        console.log(`Coupon ${this.activatedCount} aktiviert (${ids.length - 1} übrig): ${nextId}`);
      } catch (error) {
        failed.add(nextId);
        console.warn(
          `Coupon übersprungen: ${nextId} — ${error instanceof Error ? error.message.split("\n")[0] : error}`,
        );
      }
    }

    return this.activatedCount;
  }

  async countAvailableCoupons(): Promise<number> {
    return this.page.locator(Selectors.notActivatedButton).count();
  }

  async hasNoCouponsLeft(): Promise<boolean> {
    const headline = this.page.locator(Selectors.noCouponsHeadline);
    return headline.isVisible().catch(() => false);
  }
}
