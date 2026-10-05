import { type Page } from "@playwright/test";

const BASE_URL = "https://www.payback.de";
const COUPON_PATH = "/coupons";
const CLICK_TIMEOUT = 10_000;
const RELOAD_EVERY = 50;

const Selectors = {
  // eslint-disable-next-line quotes
  notActivatedButton: '[data-testid^="coupon-button-"][data-testid$="-not_activated"]',
  // eslint-disable-next-line quotes
  noCouponsHeadline: '[data-testid="not-activated-coupons-headline"]',
} as const;

export class CouponPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto(`${BASE_URL}${COUPON_PATH}`);
  }

  // Running total across page reloads; stays readable if activateAllCoupons() throws midway.
  activatedCount = 0;

  async activateAllCoupons(): Promise<number> {
    const buttons = this.page.locator(Selectors.notActivatedButton);
    const failed = new Set<string>();
    let activatedSinceReload = 0;

    for (;;) {
      // PayBack slows down / stops rendering coupons after many clicks, so reload periodically.
      if (activatedSinceReload >= RELOAD_EVERY) {
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
        await this.page.locator(selector).first().click({ timeout: CLICK_TIMEOUT });
        // The button flips to "...-activated" on success; a stuck one stays "not_activated".
        await this.page.waitForSelector(selector, { state: "detached", timeout: CLICK_TIMEOUT });
        this.activatedCount++;
        activatedSinceReload++;
        console.log(`Coupon ${this.activatedCount} aktiviert (${ids.length - 1} übrig): ${nextId}`);
      } catch (error) {
        failed.add(nextId);
        console.warn(
          `Coupon übersprungen: ${nextId} — ${error instanceof Error ? error.message.split("\n")[0] : error}`,
        );
      }

      await this.page.waitForTimeout(75);
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
