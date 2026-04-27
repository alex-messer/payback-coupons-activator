import { test } from "./fixtures/stealth.fixture";
import { LoginPage } from "./pages/login.page";
import { CouponPage } from "./pages/coupon.page";
import { TelegramService } from "./services/telegram.service";

test("activate PayBack coupons", async ({ page }) => {
  const userEmailOrId = process.env.userEmailOrId as string;
  const userPassword = process.env.userPassword as string;
  const telegram = new TelegramService();

  try {
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.dismissCookieConsent();
    await loginPage.login(userEmailOrId, userPassword);

    const couponPage = new CouponPage(page);
    await couponPage.navigate();

    const totalBefore = await couponPage.countAvailableCoupons();
    const activated = await couponPage.activateAllCoupons();
    const allDone = await couponPage.hasNoCouponsLeft();

    if (activated > 0) {
      await telegram.send(
        `*PAYBACK Coupons*\n${activated} Coupons aktiviert.${allDone ? "\nAlle Coupons sind jetzt aktiviert." : ""}`,
      );
    } else if (totalBefore === 0 || allDone) {
      await telegram.send("*PAYBACK Coupons*\nKeine neuen Coupons vorhanden.");
    } else {
      await telegram.send(
        `*PAYBACK Coupons*\n0 Coupons aktiviert, aber ${totalBefore} waren verfügbar. Mögliches Problem beim Aktivieren.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await telegram.send(`*PAYBACK Coupons — Fehler*\n${message.slice(0, 500)}`);
    throw error;
  } finally {
    await page.context().browser()?.close();
  }
});
