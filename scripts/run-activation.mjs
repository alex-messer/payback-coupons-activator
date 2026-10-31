// Entry point for `npm run activatePaybackCoupons`. Wires the activation loop to the real Playwright CLI and state file.
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runActivationLoop } from "./activation-loop.mjs";

const STATE_DIR = join(homedir(), ".payback-coupons-activator");
const RUN_STATE_FILE = join(STATE_DIR, "run-state.json");
const PLAYWRIGHT_CLI = "node_modules/@playwright/test/cli.js";

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
process.exit(await runActivationLoop({ runSpec: runSpecOnce, readState }));
