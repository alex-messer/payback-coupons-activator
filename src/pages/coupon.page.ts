import { type Page } from "@playwright/test";

const BASE_URL = "https://www.payback.de";
const COUPON_PATH = "/coupons";
const BATCH_SIZE = 100;
const MIN_DELAY = 500;
const MAX_DELAY = 3_000;

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

  async activateAllCoupons(): Promise<number> {
    let activated = 0;

    while (true) {
      const buttons = this.page.locator(Selectors.notActivatedButton);
      const count = await buttons.count();

      if (count === 0) break;

      for (let i = 0; i < count; i++) {
        await buttons.nth(i).click();
        activated++;

        const delay = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
        await this.page.waitForTimeout(delay);

        if (activated % BATCH_SIZE === 0) {
          await this.navigate();
          break;
        }
      }

      if (activated % BATCH_SIZE !== 0) break;
    }

    return activated;
  }

  async countAvailableCoupons(): Promise<number> {
    return this.page.locator(Selectors.notActivatedButton).count();
  }

  async hasNoCouponsLeft(): Promise<boolean> {
    const headline = this.page.locator(Selectors.noCouponsHeadline);
    return headline.isVisible().catch(() => false);
  }
}
