// Starts the activation test in fresh processes. Each process activates one batch (see BATCH_LIMIT in
// src/index.spec.ts), closes the browser, and exits; this launcher then starts the next process.
// It stops when no coupons are left to activate, when a run fails, or after MAX_RUNS.
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_RUNS = 10;
const RESTART_DELAY_MS = 60_000;
const STATE_DIR = join(homedir(), ".payback-coupons-activator");
const RUN_STATE_FILE = join(STATE_DIR, "run-state.json");
const PLAYWRIGHT_CLI = "node_modules/@playwright/test/cli.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function runSpecOnce() {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [PLAYWRIGHT_CLI, "test", "src/index.spec.ts"], {
      stdio: "inherit",
      env: { ...process.env, RUN_STATE_FILE },
    });
    child.on("exit", code => resolve(code ?? 1));
  });
}

async function readState() {
  try {
    return JSON.parse(await readFile(RUN_STATE_FILE, "utf8"));
  } catch {
    return undefined;
  }
}

await mkdir(STATE_DIR, { recursive: true });

for (let run = 1; run <= MAX_RUNS; run++) {
  console.log(`\n=== Prozess ${run}/${MAX_RUNS} startet ===`);
  const code = await runSpecOnce();
  const state = await readState();

  if (code !== 0) {
    console.error(`Prozess ${run} fehlgeschlagen (Exit ${code}) — kein automatischer Neustart.`);
    process.exit(code);
  }

  if (state?.status !== "batch_limit") {
    console.log(`Fertig. Gesamt aktiviert: ${state?.total ?? 0}`);
    process.exit(0);
  }

  console.log(`Batch voll (gesamt ${state.total}). Neustart in ${RESTART_DELAY_MS / 1000} s.`);
  await sleep(RESTART_DELAY_MS);
}

console.error(`MAX_RUNS (${MAX_RUNS}) erreicht — Lauf abgebrochen.`);
process.exit(1);
