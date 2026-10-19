import { test } from "./fixtures/browser.fixture";
import { LoginPage } from "./pages/login.page";
import { CouponPage } from "./pages/coupon.page";
import { TelegramService } from "./services/telegram.service";
import { readRunState, writeRunState } from "./services/run-state.service";

// Activations per process. After this many the browser is closed and the launcher restarts the process.
const BATCH_LIMIT = 100;

test("activate PayBack coupons", async ({ page }) => {
  const userEmailOrId = process.env.userEmailOrId as string;
  const userPassword = process.env.userPassword as string;
  const telegram = new TelegramService();
  const couponPage = new CouponPage(page);

  try {
    const loginPage = new LoginPage(page, () =>
      telegram.send(
        "*PAYBACK Coupons*\nCloudflare Turnstile — bitte Checkbox im Browser manuell lösen (Fenster öffnen).",
      ),
    );
    await loginPage.navigate();
    await loginPage.dismissCookieConsent();
    await loginPage.login(userEmailOrId, userPassword);

    await couponPage.navigate();

    const totalBefore = await couponPage.countAvailableCoupons();
    const activated = await couponPage.activateAllCoupons(BATCH_LIMIT);
    const allDone = await couponPage.hasNoCouponsLeft();

    // A full batch ends this run: the test returns, the fixture closes the browser, and the launcher starts a fresh process.
    const restart = activated >= BATCH_LIMIT && !allDone;
    const total = ((await readRunState())?.total ?? 0) + activated;
    await writeRunState({ status: restart ? "batch_limit" : "done", total });

    if (restart) {
      await telegram.send(
        `*PAYBACK Coupons*\n${BATCH_LIMIT} Coupons aktiviert (gesamt ${total}).\nBrowser wird geschlossen und der Prozess neu gestartet.`,
      );
    } else if (activated > 0) {
      await telegram.send(
        `*PAYBACK Coupons*\n${activated} Coupons aktiviert (gesamt ${total}).${allDone ? "\nAlle Coupons sind jetzt aktiviert." : ""}`,
      );
    } else if (totalBefore > 0 && !allDone) {
      await telegram.send(
        `*PAYBACK Coupons*\n0 Coupons aktiviert, aber ${totalBefore} waren verfügbar. Mögliches Problem beim Aktivieren.`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const partial = couponPage.activatedCount > 0 ? `\nBis dahin ${couponPage.activatedCount} Coupons aktiviert.` : "";
    await telegram.send(`*PAYBACK Coupons — Fehler*\n${message.slice(0, 500)}${partial}`);
    throw error;
  }
});
