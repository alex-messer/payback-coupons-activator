// Runs the activation spec in fresh processes until nothing is left to activate. Each process activates one
// batch (see BATCH_LIMIT in src/index.spec.ts), closes the browser, and exits; the loop then starts the next one.
// Stops when a run reports "done", a run fails (exit code != 0), or maxRuns is reached.

export const MAX_RUNS = 10;
export const RESTART_DELAY_MS = 60_000;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {object} deps
 * @param {(run: number) => Promise<number>} deps.runSpec starts one spec process, resolves with its exit code
 * @param {() => Promise<{status?: string, total?: number} | undefined>} deps.readState reads the run state after a run
 * @returns {Promise<number>} process exit code for the launcher
 */
export async function runActivationLoop({
  runSpec,
  readState,
  sleep = defaultSleep,
  log = console.log,
  error = console.error,
  maxRuns = MAX_RUNS,
  restartDelayMs = RESTART_DELAY_MS,
}) {
  for (let run = 1; run <= maxRuns; run++) {
    log(`\n=== Prozess ${run}/${maxRuns} startet ===`);
    const code = await runSpec(run);
    const state = await readState();

    if (code !== 0) {
      error(`Prozess ${run} fehlgeschlagen (Exit ${code}) — kein automatischer Neustart.`);
      return code;
    }

    if (state?.status !== "batch_limit") {
      log(`Fertig. Gesamt aktiviert: ${state?.total ?? 0}`);
      return 0;
    }

    log(`Batch voll (gesamt ${state.total}). Neustart in ${restartDelayMs / 1000} s.`);
    await sleep(restartDelayMs);
  }

  error(`MAX_RUNS (${maxRuns}) erreicht — Lauf abgebrochen.`);
  return 1;
}
