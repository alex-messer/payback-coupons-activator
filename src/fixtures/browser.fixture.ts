import { test as base, type BrowserContext } from "@playwright/test";
import { chromium } from "patchright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Patchright is an undetected Playwright fork that closes the CDP automation
// leaks (notably Runtime.enable) that Cloudflare/DataDome use to flag bots —
// the signal fingerprint-only tools (e.g. Camoufox) leave open. Per its
// authors, maximum stealth requires launchPersistentContext with the real
// Chrome channel, a headful window and no viewport override; custom
// userAgent/args/init-scripts re-introduce detectable signals, so we add none.
// Headful means the Docker container needs a virtual display (Xvfb) — the
// entrypoint provides one.
export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "patchright-payback-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: false,
      viewport: null,
    });

    try {
      await use(context);
    } finally {
      await context.close().catch(() => undefined);
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
});
