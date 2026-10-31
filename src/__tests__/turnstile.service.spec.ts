import { test, expect, mockHosts } from "./fixtures/chrome.fixture";
import { TurnstileService, type TurnstileTimings } from "../services/turnstile.service";

const PAGE_URL = "https://www.payback.de/turnstile-test";
const FRAME_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const VALID_TOKEN = "T".repeat(30);

// Short timings so the timeout paths finish quickly.
const FAST: Partial<TurnstileTimings> = {
  frameAppearTimeoutMs: 800,
  framePollIntervalMs: 50,
  tokenPollTimeoutMs: 800,
  tokenPollIntervalMs: 50,
  widgetSettleMs: 300,
  clickAttempts: 2,
  tokenPollAfterClickMs: 400,
};

type FrameMode = "none" | "solves-on-click" | "dead";

// Parent page with the hidden token input. The challenge iframe is served from a separate origin, so it
// reports clicks to the parent via postMessage; the parent then writes the token, like Cloudflare does.
function parentHtml({
  frame,
  token = "",
  autoTokenAfterMs,
}: {
  frame: FrameMode;
  token?: string;
  autoTokenAfterMs?: number;
}) {
  const iframe = frame === "none" ? "" : `<iframe src="${FRAME_URL}" width="300" height="65"></iframe>`;
  const auto = autoTokenAfterMs === undefined ? "" : `setTimeout(setToken, ${autoTokenAfterMs});`;
  return `<!doctype html><html><body>
<input name="botProtectionResponse" value="${token}">
${iframe}
<script>
  window.clicks = 0;
  function setToken() { document.querySelector("input[name='botProtectionResponse']").value = "${VALID_TOKEN}"; }
  window.addEventListener("message", event => {
    if (event.data === "clicked") { window.clicks++; setToken(); }
  });
  ${auto}
</script></body></html>`;
}

function challengeHtml(frame: FrameMode) {
  const script =
    frame === "solves-on-click"
      ? 'document.body.addEventListener("click", () => parent.postMessage("clicked", "*"));'
      : "";
  return `<!doctype html><html><body style="margin:0"><script>${script}</script></body></html>`;
}

async function openSite(
  page: import("@playwright/test").Page,
  options: { frame: FrameMode; token?: string; autoTokenAfterMs?: number },
) {
  await mockHosts(page, (url: URL) => {
    if (url.href === PAGE_URL) return { body: parentHtml(options) };
    if (url.href === FRAME_URL) return { body: challengeHtml(options.frame) };
    return undefined;
  });
  await page.goto(PAGE_URL);
  if (options.frame !== "none") await page.waitForSelector("iframe");
}

test.describe("detection", () => {
  test("isPresent is false without a Turnstile iframe", async ({ page }) => {
    await openSite(page, { frame: "none" });

    expect(await new TurnstileService(page, FAST).isPresent()).toBe(false);
  });

  test("isPresent is true when a Cloudflare challenge iframe is loaded", async ({ page }) => {
    await openSite(page, { frame: "dead" });

    expect(await new TurnstileService(page, FAST).isPresent()).toBe(true);
  });
});

test.describe("token inspection", () => {
  test("hasToken is false when the input is empty", async ({ page }) => {
    await page.setContent('<input name="botProtectionResponse" value="">');

    expect(await new TurnstileService(page, FAST).hasToken()).toBe(false);
  });

  test("hasToken is false for a token that is too short", async ({ page }) => {
    await page.setContent('<input name="botProtectionResponse" value="short">');

    expect(await new TurnstileService(page, FAST).hasToken()).toBe(false);
  });

  test("hasToken is true for a token longer than 20 characters", async ({ page }) => {
    await page.setContent(`<input name="botProtectionResponse" value="${VALID_TOKEN}">`);

    expect(await new TurnstileService(page, FAST).hasToken()).toBe(true);
  });

  test("hasToken is false when there is no token input at all", async ({ page }) => {
    await page.setContent("<p>no widget</p>");

    expect(await new TurnstileService(page, FAST).hasToken()).toBe(false);
  });
});

test.describe("solveIfPresent", () => {
  test("returns true immediately when a token is already present, without clicking", async ({ page }) => {
    await openSite(page, { frame: "solves-on-click", token: VALID_TOKEN });

    expect(await new TurnstileService(page, FAST).solveIfPresent()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(0);
  });

  test("returns false when no challenge frame appears within the timeout", async ({ page }) => {
    await openSite(page, { frame: "none" });

    expect(await new TurnstileService(page, FAST).solveIfPresent()).toBe(false);
  });

  test("accepts a token that is auto-issued while the widget settles, without clicking", async ({ page }) => {
    await openSite(page, { frame: "solves-on-click", autoTokenAfterMs: 100 });

    expect(await new TurnstileService(page, FAST).solveIfPresent()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(0);
  });

  test("clicks the checkbox when no token is auto-issued and returns true once it is issued", async ({ page }) => {
    await openSite(page, { frame: "solves-on-click" });

    expect(await new TurnstileService(page, FAST).solveIfPresent()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBeGreaterThanOrEqual(1);
  });

  test("returns false when the widget never yields a token after all click attempts", async ({ page }) => {
    await openSite(page, { frame: "dead" });

    expect(await new TurnstileService(page, FAST).solveIfPresent()).toBe(false);
  });
});

test.describe("waitForToken", () => {
  test("resolves true once the token appears within the timeout", async ({ page }) => {
    await page.setContent('<input name="botProtectionResponse" value="">');
    await page.evaluate(VALID_TOKEN => {
      setTimeout(() => {
        document.querySelector("input[name='botProtectionResponse']")?.setAttribute("value", VALID_TOKEN);
      }, 150);
    }, VALID_TOKEN);

    expect(await new TurnstileService(page, FAST).waitForToken(1_000)).toBe(true);
  });

  test("resolves false when no token appears before the timeout", async ({ page }) => {
    await page.setContent('<input name="botProtectionResponse" value="">');

    expect(await new TurnstileService(page, FAST).waitForToken(300)).toBe(false);
  });
});
