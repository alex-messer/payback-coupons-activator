import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Smoke test: verify that the offline reCAPTCHA solver's runtime
 * dependencies are usable on this machine.
 *
 * We do NOT test against Google's demo page — Google's reCAPTCHA actively
 * detects automation on its own demo URL and refuses to serve the audio
 * challenge frame. That makes the demo a poor signal for whether the
 * solver works on real third-party sites (where the bframe is normally
 * already visible when a challenge is shown).
 *
 * Instead, this test asserts that the components the solver depends on
 * are present and functional:
 *   1. `ffmpeg` is on PATH (audio decode)
 *   2. The Vosk acoustic model is fully extracted
 *   3. The `recaptcha-solver` library imports and exposes its API
 *
 * The actual end-to-end captcha-solving path is exercised by the real
 * PayBack login when (and only when) a challenge is served.
 */
test("captcha solver dependencies are available", async () => {
  // 1. ffmpeg
  const ffmpegVersion = execFileSync("ffmpeg", ["-version"], { encoding: "utf8" });
  expect(ffmpegVersion, "ffmpeg should be on PATH").toContain("ffmpeg version");

  // 2. Vosk model (downloaded by recaptcha-solver's postinstall script)
  const modelDir = path.join("node_modules", "recaptcha-solver", "model");
  expect(fs.existsSync(path.join(modelDir, "DONE")), "Vosk model DONE marker should exist").toBe(true);
  for (const sub of ["am", "conf", "graph", "ivector"]) {
    expect(fs.existsSync(path.join(modelDir, sub)), `Vosk model ${sub}/ should exist`).toBe(true);
  }

  // 3. recaptcha-solver public API
  const solver = await import("recaptcha-solver");
  expect(typeof solver.solve, "solve() should be a function").toBe("function");
  expect(typeof solver.exists, "exists() should be a function").toBe("function");
});
