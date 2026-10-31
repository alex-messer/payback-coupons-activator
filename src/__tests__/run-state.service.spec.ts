import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRunState, writeRunState } from "../services/run-state.service";

let dir: string;

test.beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "run-state-test-"));
});

test.afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("readRunState returns undefined when no state file exists", async () => {
  expect(await readRunState(join(dir, "missing.json"))).toBeUndefined();
});

test("readRunState returns undefined for a corrupt state file", async () => {
  const file = join(dir, "broken.json");
  await writeFile(file, "{ not json", "utf8");

  expect(await readRunState(file)).toBeUndefined();
});

test("writeRunState persists the state and readRunState reads it back", async () => {
  const file = join(dir, "state.json");

  await writeRunState({ status: "batch_limit", total: 100 }, file);

  expect(await readRunState(file)).toEqual({ status: "batch_limit", total: 100 });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ status: "batch_limit", total: 100 });
});

test("writeRunState creates missing parent directories", async () => {
  const file = join(dir, "nested", "deeper", "state.json");

  await writeRunState({ status: "done", total: 0 }, file);

  expect(await readRunState(file)).toEqual({ status: "done", total: 0 });
});

test("writeRunState overwrites the previous state", async () => {
  const file = join(dir, "state.json");
  await writeRunState({ status: "batch_limit", total: 100 }, file);

  await writeRunState({ status: "done", total: 135 }, file);

  expect(await readRunState(file)).toEqual({ status: "done", total: 135 });
});
