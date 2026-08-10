import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Checks the offline reCAPTCHA solver's runtime deps, not Google's demo page
// (it detects automation and blocks the audio challenge there).
test("captcha solver dependencies are available", async () => {
  const ffmpegVersion = execFileSync("ffmpeg", ["-version"], { encoding: "utf8" });
  expect(ffmpegVersion, "ffmpeg should be on PATH").toContain("ffmpeg version");

  const modelDir = path.join("node_modules", "recaptcha-solver", "model");
  expect(fs.existsSync(path.join(modelDir, "DONE")), "Vosk model DONE marker should exist").toBe(true);
  for (const sub of ["am", "conf", "graph", "ivector"]) {
    expect(fs.existsSync(path.join(modelDir, sub)), `Vosk model ${sub}/ should exist`).toBe(true);
  }

  const solver = await import("recaptcha-solver");
  expect(typeof solver.solve, "solve() should be a function").toBe("function");
  expect(typeof solver.exists, "exists() should be a function").toBe("function");
});
