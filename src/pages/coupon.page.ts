import { type Page } from "@playwright/test";

const BASE_URL = "https://www.payback.de";
const COUPON_PATH = "/coupons";
const BATCH_SIZE = 35;

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
    const buttons = this.page.locator(Selectors.notActivatedButton);
    let activated = 0;

    while ((await buttons.count()) > 0) {
      await buttons.first().click();
      activated++;

      await this.page.waitForTimeout(1_000);

      if (activated >= BATCH_SIZE) {
        await this.navigate();
        return activated + (await this.activateAllCoupons());
      }
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
