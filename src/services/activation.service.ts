import { readRunState, writeRunState, RUN_STATE_FILE } from "./run-state.service";

// Only the parts of CouponPage and TelegramService that the activation flow uses, so tests can pass fakes.
export type ActivationCouponPage = {
  readonly activatedCount: number;
  navigate(): Promise<void>;
  countAvailableCoupons(): Promise<number>;
  activateAllCoupons(limit?: number): Promise<number>;
  hasNoCouponsLeft(): Promise<boolean>;
};

export type Notifier = {
  send(message: string): Promise<void>;
};

export type ActivationDeps = {
  login: () => Promise<void>;
  couponPage: ActivationCouponPage;
  telegram: Notifier;
  batchLimit: number;
  stateFile?: string;
};

// Runs one batch: login, activate up to batchLimit coupons, persist the running total, and notify.
// Returns the number of coupons activated in this batch. Errors are reported via Telegram and rethrown.
export async function runActivation({
  login,
  couponPage,
  telegram,
  batchLimit,
  stateFile = RUN_STATE_FILE,
}: ActivationDeps): Promise<number> {
  try {
    await login();
    await couponPage.navigate();

    const totalBefore = await couponPage.countAvailableCoupons();
    const activated = await couponPage.activateAllCoupons(batchLimit);
    const allDone = await couponPage.hasNoCouponsLeft();

    // A full batch ends this run: the caller closes the browser and the launcher starts a fresh process.
    const restart = activated >= batchLimit && !allDone;
    const total = ((await readRunState(stateFile))?.total ?? 0) + activated;
    await writeRunState({ status: restart ? "batch_limit" : "done", total }, stateFile);

    if (restart) {
      await telegram.send(
        `*PAYBACK Coupons*\n${batchLimit} Coupons aktiviert (gesamt ${total}).\nBrowser wird geschlossen und der Prozess neu gestartet.`,
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

    return activated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const partial = couponPage.activatedCount > 0 ? `\nBis dahin ${couponPage.activatedCount} Coupons aktiviert.` : "";
    await telegram.send(`*PAYBACK Coupons — Fehler*\n${message.slice(0, 500)}${partial}`);
    throw error;
  }
}
