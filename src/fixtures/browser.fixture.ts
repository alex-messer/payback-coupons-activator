import { test as base, type BrowserContext } from "@playwright/test";
import { chromium } from "patchright";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Persistent across runs so Cloudflare can accumulate trust (cf_clearance cookie) for this browser.
// Delete the directory manually only when the profile is corrupted.
const PROFILE_DIR = join(homedir(), ".payback-coupons-activator", "chrome-profile");

// Patchright closes the CDP leak Cloudflare uses to flag bots. Don't add
// userAgent/args/init-scripts below — each reintroduces a detectable signal.
export const test = base.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    await mkdir(PROFILE_DIR, { recursive: true });
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      viewport: null,
    });

    try {
      await use(context);
    } finally {
      await context.close().catch(() => undefined);
      // Profile is intentionally kept — accumulated cookies and Cloudflare trust carry over to future runs.
    }
  },
});
