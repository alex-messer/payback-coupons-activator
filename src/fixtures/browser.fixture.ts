import { test as base, type BrowserContext } from "@playwright/test";
import { chromium } from "patchright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Patchright closes the CDP leak Cloudflare uses to flag bots. Don't add
// userAgent/args/init-scripts below — each reintroduces a detectable signal.
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
