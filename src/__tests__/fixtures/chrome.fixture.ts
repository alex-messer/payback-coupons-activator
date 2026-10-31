import { chromium, test as base, type Browser, type Page } from "@playwright/test";

// Browser-level tests run against the real Chrome channel (headless, no network).
// Use mockHosts() to serve every https request from the test itself, so no test ever reaches payback.de or Cloudflare.
export const test = base.extend<object, { browser: Browser }>({
  browser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const browser = await chromium.launch({ channel: "chrome", headless: true });
      await use(browser);
      await browser.close();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";

export type MockResponse = {
  status?: number;
  contentType?: string;
  body: string;
};

export type MockHandler = (url: URL, method: string) => MockResponse | undefined;

export async function mockHosts(page: Page, handler: MockHandler): Promise<void> {
  await page.route(/^https:\/\//, async route => {
    const request = route.request();
    const mocked = handler(new URL(request.url()), request.method());
    if (!mocked) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "not mocked" });
      return;
    }
    await route.fulfill({
      status: mocked.status ?? 200,
      contentType: mocked.contentType ?? "text/html; charset=utf-8",
      body: mocked.body,
    });
  });
}
