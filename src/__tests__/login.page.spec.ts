import { test, expect, mockHosts } from "./fixtures/chrome.fixture";
import { LoginPage, type LoginTimings } from "../pages/login.page";
import { type TurnstileTimings } from "../services/turnstile.service";
import { type Page } from "@playwright/test";

const BASE = "https://www.payback.de";
const FRAME_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const VALID_TOKEN = "T".repeat(30);

const FAST_LOGIN: Partial<LoginTimings> = {
  captchaTimeoutMs: 1_000,
  loginTimeoutMs: 1_000,
  postCaptchaDelayMs: 0,
  reloadCheckIntervalMs: 50,
  postSolveSettleMs: 300,
  homepageDwellMs: 0,
  cookieClickTimeoutMs: 200,
};

const FAST_TURNSTILE: Partial<TurnstileTimings> = {
  frameAppearTimeoutMs: 500,
  framePollIntervalMs: 50,
  tokenPollTimeoutMs: 500,
  tokenPollIntervalMs: 50,
  widgetSettleMs: 100,
  clickAttempts: 1,
  tokenPollAfterClickMs: 200,
};

type LoginSiteOptions = {
  // Token already in the hidden input (Turnstile auto-issued). Empty = Turnstile must be solved.
  token?: string;
  // Whether Einloggen navigates away from /login. false simulates a login that never completes.
  loginSucceeds?: boolean;
  // Whether a Turnstile challenge iframe is embedded on the login page.
  challengeFrame?: boolean;
};

// Serves a fake PayBack: home, login (two-step form), konto (logged-in page), and cookie banner.
function loginSite(options: LoginSiteOptions = {}) {
  const { token = "", loginSucceeds = true, challengeFrame = false } = options;
  const visited: string[] = [];

  const loginHtml = `<!doctype html><html><body>
<label for="email">E-Mail oder Kundennummer</label>
<input id="email" type="text">
<input name="botProtectionResponse" value="${token}">
${challengeFrame ? `<iframe src="${FRAME_URL}" width="300" height="65"></iframe>` : ""}
<button id="weiter" onclick="document.getElementById('password-step').hidden = false">Weiter</button>
<div id="password-step" hidden>
  <input id="password" type="password">
  <button id="einloggen">Einloggen</button>
</div>
<script>
  document.getElementById("einloggen").addEventListener("click", () => {
    // The submitted values travel in the query string so tests can assert what was typed (test-only mock).
    if (${loginSucceeds}) {
      const email = encodeURIComponent(document.getElementById("email").value);
      const password = encodeURIComponent(document.getElementById("password").value);
      location.href = "/konto?email=" + email + "&password=" + password;
    }
  });
</script></body></html>`;

  const handler = (url: URL) => {
    if (url.origin !== BASE) {
      if (url.href === FRAME_URL) return { body: "<!doctype html><body></body>" };
      return undefined;
    }
    visited.push(url.pathname);
    if (url.pathname === "/") return { body: "<!doctype html><html><body><h1>Home</h1></body></html>" };
    if (url.pathname === "/login") return { body: loginHtml };
    if (url.pathname === "/konto") return { body: "<!doctype html><html><body><h1>Konto</h1></body></html>" };
    return undefined;
  };

  return { handler, visited };
}

async function openLogin(page: Page, options: LoginSiteOptions = {}) {
  const site = loginSite(options);
  await mockHosts(page, site.handler);
  return site;
}

test.describe("navigate and cookie consent", () => {
  test("navigate visits the homepage before the login page", async ({ page }) => {
    const site = await openLogin(page);
    const login = new LoginPage(page, undefined, { timings: FAST_LOGIN });

    await login.navigate();

    expect(site.visited).toEqual(["/", "/login"]);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("dismissCookieConsent accepts the banner when it is shown", async ({ page }) => {
    await mockHosts(page, url => {
      if (url.origin !== BASE) return undefined;
      return {
        body: `<!doctype html><html><body>
<button id="onetrust-accept-btn-handler" onclick="window.accepted = true">Alle akzeptieren</button>
</body></html>`,
      };
    });
    await page.goto(`${BASE}/login`);

    await new LoginPage(page, undefined, { timings: FAST_LOGIN }).dismissCookieConsent();

    expect(await page.evaluate(() => (window as unknown as { accepted?: boolean }).accepted)).toBe(true);
  });

  test("dismissCookieConsent tolerates a missing banner", async ({ page }) => {
    await openLogin(page);
    await page.goto(`${BASE}/login`);

    await expect(
      new LoginPage(page, undefined, { timings: FAST_LOGIN }).dismissCookieConsent(),
    ).resolves.toBeUndefined();
  });
});

test.describe("login", () => {
  test("logs in with a pre-issued Turnstile token and ends up off the login page", async ({ page }) => {
    await openLogin(page, { token: VALID_TOKEN });
    await page.goto(`${BASE}/login`);

    await new LoginPage(page, undefined, { timings: FAST_LOGIN, turnstileTimings: FAST_TURNSTILE }).login(
      "kunde-123",
      "geheim",
    );

    const landed = new URL(page.url());
    expect(landed.pathname).toBe("/konto");
    expect(landed.searchParams.get("email")).toBe("kunde-123");
    expect(landed.searchParams.get("password")).toBe("geheim");
  });

  test("skips the login entirely when the persistent session is still active", async ({ page }) => {
    await openLogin(page, { token: "" });
    await page.goto(`${BASE}/konto`);

    await new LoginPage(page, undefined, { timings: FAST_LOGIN }).login("kunde-123", "geheim");

    expect(new URL(page.url()).pathname).toBe("/konto");
  });

  test("calls the manual-solve callback and continues once the user provides the token", async ({ page }) => {
    await openLogin(page, { token: "", challengeFrame: false });
    await page.goto(`${BASE}/login`);
    let manualCalls = 0;

    await new LoginPage(
      page,
      async () => {
        manualCalls++;
        // Stands in for the user solving the widget in the browser window.
        await page.evaluate(
          token =>
            (document.querySelector("input[name='botProtectionResponse']") as HTMLInputElement).setAttribute(
              "value",
              token,
            ),
          VALID_TOKEN,
        );
      },
      { timings: FAST_LOGIN, turnstileTimings: FAST_TURNSTILE },
    ).login("kunde-123", "geheim");

    expect(manualCalls).toBe(1);
    expect(new URL(page.url()).pathname).toBe("/konto");
  });

  test("throws the German Turnstile error when no token is produced even after manual wait", async ({ page }) => {
    await openLogin(page, { token: "" });
    await page.goto(`${BASE}/login`);

    await expect(
      new LoginPage(page, undefined, { timings: FAST_LOGIN, turnstileTimings: FAST_TURNSTILE }).login(
        "kunde-123",
        "geheim",
      ),
    ).rejects.toThrow("Cloudflare Turnstile konnte nicht gelöst werden");
  });

  test("throws a timeout when the login never leaves the login page", async ({ page }) => {
    await openLogin(page, { token: VALID_TOKEN, loginSucceeds: false });
    await page.goto(`${BASE}/login`);

    await expect(
      new LoginPage(page, undefined, { timings: FAST_LOGIN, turnstileTimings: FAST_TURNSTILE }).login(
        "kunde-123",
        "geheim",
      ),
    ).rejects.toThrow("Timeout waiting for login to complete");
  });
});
