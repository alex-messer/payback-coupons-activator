import { test } from "./fixtures/browser.fixture";
import { LoginPage } from "./pages/login.page";
import { CouponPage } from "./pages/coupon.page";
import { TelegramService } from "./services/telegram.service";
import { runActivation } from "./services/activation.service";

// Activations per process. After this many the browser is closed and the launcher restarts the process.
const BATCH_LIMIT = 100;

test("activate PayBack coupons", async ({ page }) => {
  const userEmailOrId = process.env.userEmailOrId as string;
  const userPassword = process.env.userPassword as string;
  const telegram = new TelegramService();
  const couponPage = new CouponPage(page);
  const loginPage = new LoginPage(page, () =>
    telegram.send(
      "*PAYBACK Coupons*\nCloudflare Turnstile — bitte Checkbox im Browser manuell lösen (Fenster öffnen).",
    ),
  );

  await runActivation({
    login: async () => {
      await loginPage.navigate();
      await loginPage.dismissCookieConsent();
      await loginPage.login(userEmailOrId, userPassword);
    },
    couponPage,
    telegram,
    batchLimit: BATCH_LIMIT,
  });
});
