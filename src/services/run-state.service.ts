import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Shared between the launcher (scripts/run-activation.mjs) and the spec, so the spec can report the running total across restarts.
export const RUN_STATE_FILE =
  process.env.RUN_STATE_FILE ?? join(homedir(), ".payback-coupons-activator", "run-state.json");

export type RunState = {
  // "batch_limit": the batch filled up and a restart is needed. "done": no activatable coupons are left.
  status: "batch_limit" | "done";
  total: number;
};

export async function readRunState(file: string = RUN_STATE_FILE): Promise<RunState | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as RunState;
  } catch {
    return undefined;
  }
}

export async function writeRunState(state: RunState, file: string = RUN_STATE_FILE): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2), "utf8");
}
