import { test, expect } from "@playwright/test";
// Plain ESM module under scripts/, imported directly so the restart policy is tested without spawning processes.
import { runActivationLoop } from "../../scripts/activation-loop.mjs";

type State = { status?: string; total?: number } | undefined;

// Each run returns the next exit code; each state read returns the next state.
function harness({ exitCodes, states, maxRuns = 10 }: { exitCodes: number[]; states: State[]; maxRuns?: number }) {
  const runs: number[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  let exitIndex = 0;
  let stateIndex = 0;

  const run = () =>
    runActivationLoop({
      runSpec: async (run: number) => {
        runs.push(run);
        return exitCodes[exitIndex++] ?? 0;
      },
      readState: async () => states[stateIndex++],
      sleep: async (ms: number) => void sleeps.push(ms),
      log: (message: string) => void logs.push(message),
      error: (message: string) => void errors.push(message),
      maxRuns,
      restartDelayMs: 60_000,
    });

  return { run, runs, sleeps, logs, errors };
}

test("a single run that finishes returns 0 without restarting", async () => {
  const h = harness({ exitCodes: [0], states: [{ status: "done", total: 35 }] });

  expect(await h.run()).toBe(0);

  expect(h.runs).toEqual([1]);
  expect(h.sleeps).toEqual([]);
  expect(h.logs.at(-1)).toBe("Fertig. Gesamt aktiviert: 35");
});

test("a full batch triggers a restart after the delay, then the next run finishes", async () => {
  const h = harness({
    exitCodes: [0, 0],
    states: [
      { status: "batch_limit", total: 100 },
      { status: "done", total: 111 },
    ],
  });

  expect(await h.run()).toBe(0);

  expect(h.runs).toEqual([1, 2]);
  expect(h.sleeps).toEqual([60_000]);
  expect(h.logs.some(line => line.includes("Batch voll (gesamt 100)"))).toBe(true);
});

test("a failed run stops the loop with its exit code and never restarts", async () => {
  const h = harness({ exitCodes: [1], states: [{ status: "batch_limit", total: 100 }] });

  expect(await h.run()).toBe(1);

  expect(h.runs).toEqual([1]);
  expect(h.sleeps).toEqual([]);
  expect(h.errors[0]).toContain("Prozess 1 fehlgeschlagen (Exit 1)");
});

test("a failed run after a batch limit still stops instead of restarting", async () => {
  const h = harness({ exitCodes: [0, 2], states: [{ status: "batch_limit", total: 100 }, undefined] });

  expect(await h.run()).toBe(2);

  expect(h.runs).toEqual([1, 2]);
  expect(h.sleeps).toHaveLength(1);
});

test("a run that writes no state is treated as finished, not as a restart", async () => {
  const h = harness({ exitCodes: [0], states: [undefined] });

  expect(await h.run()).toBe(0);

  expect(h.sleeps).toEqual([]);
  expect(h.logs.at(-1)).toBe("Fertig. Gesamt aktiviert: 0");
});

test("the loop gives up after maxRuns consecutive full batches", async () => {
  const h = harness({
    exitCodes: [0, 0, 0],
    states: [
      { status: "batch_limit", total: 100 },
      { status: "batch_limit", total: 200 },
      { status: "batch_limit", total: 300 },
    ],
    maxRuns: 3,
  });

  expect(await h.run()).toBe(1);

  expect(h.runs).toEqual([1, 2, 3]);
  expect(h.sleeps).toHaveLength(3);
  expect(h.errors.at(-1)).toContain("MAX_RUNS (3) erreicht");
});
