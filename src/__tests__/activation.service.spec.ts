import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runActivation, type ActivationCouponPage } from "../services/activation.service";
import { readRunState } from "../services/run-state.service";

const BATCH = 100;

// Fake CouponPage: `available` coupons exist at the start; `stuck` coupons never activate.
function fakeCouponPage({
  available,
  stuck = false,
  failAfterActivation = false,
}: {
  available: number;
  stuck?: boolean;
  failAfterActivation?: boolean;
}) {
  const page = {
    activatedCount: 0,
    navigations: 0,
    limitsSeen: [] as Array<number | undefined>,
    navigate: async () => {
      page.navigations++;
    },
    countAvailableCoupons: async () => available - page.activatedCount,
    activateAllCoupons: async (limit?: number) => {
      page.limitsSeen.push(limit);
      if (!stuck) {
        const toActivate = Math.min(limit ?? Number.POSITIVE_INFINITY, available - page.activatedCount);
        page.activatedCount += toActivate;
      }
      return page.activatedCount;
    },
    hasNoCouponsLeft: async () => {
      if (failAfterActivation) throw new Error("headline check exploded");
      return available - page.activatedCount <= 0;
    },
  } satisfies ActivationCouponPage & Record<string, unknown>;
  return page;
}

function recordingTelegram() {
  const messages: string[] = [];
  return { messages, send: async (message: string) => void messages.push(message) };
}

let dir: string;
let stateFile: string;

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "activation-test-"));
  stateFile = join(dir, "state.json");
});

test.afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("a full batch returns with restart status, a restart message and the batch limit passed through", async () => {
  const couponPage = fakeCouponPage({ available: 250 });
  const telegram = recordingTelegram();
  let loggedIn = false;

  const activated = await runActivation({
    login: async () => void (loggedIn = true),
    couponPage,
    telegram,
    batchLimit: BATCH,
    stateFile,
  });

  expect(activated).toBe(BATCH);
  expect(loggedIn).toBe(true);
  expect(couponPage.navigations).toBe(1);
  expect(couponPage.limitsSeen).toEqual([BATCH]);
  expect(await readRunState(stateFile)).toEqual({ status: "batch_limit", total: BATCH });
  expect(telegram.messages).toEqual([
    "*PAYBACK Coupons*\n100 Coupons aktiviert (gesamt 100).\nBrowser wird geschlossen und der Prozess neu gestartet.",
  ]);
});

test("a partial batch that empties the list reports completion and does not restart", async () => {
  const telegram = recordingTelegram();

  const activated = await runActivation({
    login: async () => {},
    couponPage: fakeCouponPage({ available: 40 }),
    telegram,
    batchLimit: BATCH,
    stateFile,
  });

  expect(activated).toBe(40);
  expect(await readRunState(stateFile)).toEqual({ status: "done", total: 40 });
  expect(telegram.messages).toEqual([
    "*PAYBACK Coupons*\n40 Coupons aktiviert (gesamt 40).\nAlle Coupons sind jetzt aktiviert.",
  ]);
});

test("exactly one batch that also empties the list does not restart", async () => {
  const telegram = recordingTelegram();

  await runActivation({
    login: async () => {},
    couponPage: fakeCouponPage({ available: 100 }),
    telegram,
    batchLimit: BATCH,
    stateFile,
  });

  expect(await readRunState(stateFile)).toEqual({ status: "done", total: 100 });
  expect(telegram.messages[0]).toContain("Alle Coupons sind jetzt aktiviert.");
  expect(telegram.messages[0]).not.toContain("neu gestartet");
});

test("the running total accumulates across restarts via the state file", async () => {
  await runActivation({
    login: async () => {},
    couponPage: fakeCouponPage({ available: 40 }),
    telegram: recordingTelegram(),
    batchLimit: BATCH,
    stateFile,
  });
  // Pretend an earlier process already reported 35 — the same state file is shared across processes.
  const { writeRunState } = await import("../services/run-state.service");
  await writeRunState({ status: "batch_limit", total: 35 }, stateFile);

  const telegram = recordingTelegram();
  await runActivation({
    login: async () => {},
    couponPage: fakeCouponPage({ available: 40 }),
    telegram,
    batchLimit: BATCH,
    stateFile,
  });

  expect(await readRunState(stateFile)).toEqual({ status: "done", total: 75 });
  expect(telegram.messages[0]).toContain("(gesamt 75)");
});

test("nothing available sends no message and records done with total 0", async () => {
  const telegram = recordingTelegram();

  const activated = await runActivation({
    login: async () => {},
    couponPage: fakeCouponPage({ available: 0 }),
    telegram,
    batchLimit: BATCH,
    stateFile,
  });

  expect(activated).toBe(0);
  expect(telegram.messages).toEqual([]);
  expect(await readRunState(stateFile)).toEqual({ status: "done", total: 0 });
});

test("coupons left but none activated sends the possible-problem warning", async () => {
  const telegram = recordingTelegram();

  await runActivation({
    login: async () => {},
    couponPage: fakeCouponPage({ available: 5, stuck: true }),
    telegram,
    batchLimit: BATCH,
    stateFile,
  });

  expect(telegram.messages).toEqual([
    "*PAYBACK Coupons*\n0 Coupons aktiviert, aber 5 waren verfügbar. Mögliches Problem beim Aktivieren.",
  ]);
});

test("a login failure is reported via Telegram, rethrown, and leaves no state behind", async () => {
  const telegram = recordingTelegram();

  await expect(
    runActivation({
      login: async () => {
        throw new Error("Timeout waiting for password step");
      },
      couponPage: fakeCouponPage({ available: 10 }),
      telegram,
      batchLimit: BATCH,
      stateFile,
    }),
  ).rejects.toThrow("Timeout waiting for password step");

  expect(telegram.messages).toEqual(["*PAYBACK Coupons — Fehler*\nTimeout waiting for password step"]);
  expect(await readRunState(stateFile)).toBeUndefined();
});

test("an error after partial activation includes the count reached so far", async () => {
  const telegram = recordingTelegram();

  await expect(
    runActivation({
      login: async () => {},
      couponPage: fakeCouponPage({ available: 30, failAfterActivation: true }),
      telegram,
      batchLimit: BATCH,
      stateFile,
    }),
  ).rejects.toThrow("headline check exploded");

  expect(telegram.messages).toEqual([
    "*PAYBACK Coupons — Fehler*\nheadline check exploded\nBis dahin 30 Coupons aktiviert.",
  ]);
});

test("long error messages are truncated to 500 characters in the Telegram notice", async () => {
  const telegram = recordingTelegram();
  const longMessage = "x".repeat(800);

  await expect(
    runActivation({
      login: async () => {
        throw new Error(longMessage);
      },
      couponPage: fakeCouponPage({ available: 1 }),
      telegram,
      batchLimit: BATCH,
      stateFile,
    }),
  ).rejects.toThrow(longMessage);

  const text = telegram.messages[0];
  expect(text).toContain("x".repeat(500));
  expect(text).not.toContain("x".repeat(501));
});
