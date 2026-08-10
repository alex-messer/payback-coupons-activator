# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

Automates activating all available coupons on payback.de. Despite using Playwright Test as the runner, this is **not a test suite** — `src/index.spec.ts` is the production entry point, executed once per run (manually, or on a schedule via your own cron/task scheduler). Smoke tests under `src/__smoke__/` verify that supporting infrastructure (browser fixture, captcha solver dependencies) still works, and are not part of the regular run.

PayBack's login is now gated by Cloudflare Turnstile (sitekey `0x4AAAAAAB-_3aTRuD_6zxxk`, hidden input `botProtectionResponse`), which the legacy Vosk-based reCAPTCHA solver cannot clear. The solution is to drive the browser with **Patchright** (an undetected Playwright fork) instead of vanilla Playwright. Patchright closes the `Runtime.enable` CDP automation leak that Cloudflare uses to flag bots — the signal that fingerprint-only tools (Camoufox etc.) leave open. With it, Cloudflare scores the session as trustworthy and **issues the Turnstile token automatically**, so the login simply waits for the token rather than solving a challenge. No external solver, no paid service.

## Commands

Runs require credentials in `.env.local` (copy from `.env`). Both files are loaded via `node --env-file=`. The `mode` env var (`production` | anything else) only toggles `forbidOnly` in `playwright.config.ts`; the browser itself always runs headful (see Gotchas) and `retries` is fixed at 0 regardless of `mode`.

```sh
npm run activatePaybackCoupons          # Main run (browser is always visible, see Commands note above)
npm run activatePaybackCoupons:debug    # Playwright inspector

npm run smoke                           # Run all smoke tests in src/__smoke__/
npm run smoke:headed
node --env-file=.env node_modules/.bin/playwright test src/__smoke__/stealth.spec.ts   # Single smoke test

npm run check:eslint                    # Lint
npm run check:prettier                  # Format check
npm run lint:eslint                     # Lint + autofix
npm run lint:prettier                   # Format write
```

Husky hooks (`pre-commit` runs `lint-staged`, `commit-msg` runs commitlint with conventional commits). Hooks source `.husky/setup-node.sh` to force nvm-managed Node 24 onto PATH — distro Node may otherwise be too old. Commit messages must follow `@commitlint/config-conventional`.

## Architecture

The flow is a single Playwright test (`src/index.spec.ts`) wired together from three layers:

**1. Browser fixture** (`src/fixtures/browser.fixture.ts`) — overrides Playwright's default browser launch. It uses **Patchright** (`patchright` package, an undetected Chromium-only Playwright fork) via `chromium.launchPersistentContext`. Per Patchright's guidance, maximum stealth needs the real Chrome channel and a headful window with no viewport override, so the options are exactly `channel: "chrome"`, `headless: false`, `viewport: null` — and we deliberately add NO custom userAgent, args, or init scripts (each would re-introduce a detectable signal). Headful means the browser needs a real display (an X/Wayland session, or a virtual one such as `Xvfb`/WSLg). Because the fixture creates its own persistent context, the `use` options in `playwright.config.ts` (viewport/device) are NOT applied — the config's project entry only sets the test label. The fixture overrides the `context` fixture (reusing `browser.contexts()[0]`); the user-data-dir is a throwaway temp dir cleaned up on teardown.

**2. Page objects** (`src/pages/`) — encapsulate the two PayBack screens the script touches.

- `login.page.ts`: Two-step login (identification → password). On the identification step PayBack injects a Cloudflare Turnstile widget. `solveTurnstileAndSubmit()` presses Enter on the email field to trigger the widget, hands off to `TurnstileService` (with Patchright the token is normally issued automatically — see below), then clicks **"Weiter"** to advance. `waitForPasswordStep()` polls for the password field, re-handling Turnstile if it re-appears. The password step is submitted by clicking the **"Einloggen"** button (NOT Enter — Enter does not submit and leaves the page on `/login`). `waitForLoginComplete()` then polls until the URL leaves `/login`, re-handling any Turnstile on the password step. `LOGIN_TIMEOUT` = 5 min tolerates slow steps.
- `coupon.page.ts`: Activates not-yet-activated coupons identified by `data-testid="coupon-button-*-not_activated"`, clicking them one by one (75ms wait between clicks) until none are left — no batching or periodic reload. Returns the running total.

**3. Services** (`src/services/`)

- `turnstile.service.ts`: Cloudflare Turnstile detector + managed-click fallback. `isPresent()` scans `page.frames()` for URLs under `challenges.cloudflare.com` (the iframe contents live in a closed shadow DOM that `document.querySelectorAll` can't reach). `hasToken()` reads `input[name="botProtectionResponse"]`. `solveIfPresent()` first short-circuits if a token is already present — with Patchright, Cloudflare trusts the session and **auto-issues the token**, so this fast path is the normal case. Otherwise it falls back to a managed human-like click: it locates the checkbox from the frame's bounding box (via `frameElement()`, or `frame.locator("body").boundingBox()` when `frameElement()` is null — which it is in Chromium, where the iframe sits in a closed shadow DOM), moves the cursor in steps, clicks, and polls for the token up to 30 s. **No external solver.** If Cloudflare still scores us as a bot the method returns `false` and the caller surfaces a German error.
- `captcha.service.ts`: **Legacy.** Wraps the `recaptcha-solver` package (offline Vosk audio solver). No longer wired into the login flow (PayBack moved from reCAPTCHA to Turnstile), but the file is retained for reference and its smoke test still verifies the ffmpeg/Vosk toolchain.
- `telegram.service.ts`: Optional notifier. Silently no-ops when `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset. Also polls `getUpdates` and deletes any messages from chat IDs other than the configured owner — this is how the bot stays effectively private without server-side ACLs.

The orchestrating test (`src/index.spec.ts`) chooses the Telegram message based on three counts: `totalBefore` (available coupons before activation), `activated` (clicks performed), `allDone` (the "no coupons left" headline visible). Errors are caught, sent to Telegram (truncated), and re-thrown so Playwright marks the run failed.

## Style

- TypeScript, ESM. ESLint: 2-space indent, double quotes, semicolons, unix line endings. Prettier: 120-col print width, trailing commas everywhere, no single quotes.
- Test files end in `.spec.ts`. Smoke tests live in `src/__smoke__/` so they're reachable via `npm run smoke` without dragging them into the production run.
- Selectors are colocated as `const Selectors = { ... } as const` at the top of each page object.

## Gotchas

- `npm install` triggers a `recaptcha-solver` postinstall that downloads a ~70 MB Vosk model. Slow networks may need a retry; verify with `npm run smoke -- src/__smoke__/captcha.spec.ts`.
- **Patchright requires real Google Chrome** (`channel: "chrome"`) — install it with `npx patchright install --with-deps chrome`. It runs **headful** for full stealth, so the machine needs a display — a real X/Wayland session, WSLg on WSL2, or a virtual one such as `Xvfb`.
- Local browser runs on WSL Ubuntu 20.04 are unreliable (old system libs). On other Linux setups, ensure the system libs Chrome needs are present (the `--with-deps` install flag handles this on supported distros). TypeScript/ESLint/Prettier are unaffected either way.
- The Turnstile flow normally succeeds via the **auto-issued token** (Patchright's CDP-leak fix); the managed click in `turnstile.service.ts` is only a fallback. If Cloudflare ever scores the session as a bot, `solveIfPresent()` returns `false` and `login.page.ts` throws the German error `"Cloudflare Turnstile konnte nicht gelöst werden — die Session wurde von Cloudflare als Bot eingestuft."`.
- `coupon.page.ts` no longer batches/reloads — it clicks every coupon it finds in one pass. An earlier empirical finding was that PayBack throttles or stops rendering new coupons past ~35 clicks without a reload; if that resurfaces (loop ends while coupons remain), reintroduce a periodic `navigate()` + recursion.
- The login `LOGIN_TIMEOUT` of 5 minutes accommodates manual 2FA. If 2FA is required and no one is watching the (always-headful) browser to complete it, the run will hang until that timeout expires.
- `playwright.config.ts` declares `fullyParallel: true` but `workers: 1` — the workflow is single-session by design (one PayBack login).
- `retries: 0` is intentional: rapid back-to-back login attempts trigger harder bot challenges on PayBack's side. Don't rerun immediately after a failure — wait before the next manual or scheduled run.
- `actionTimeout: 0` (no per-action timeout) is intentional for slow coupon-page renders. The Turnstile service bounds itself separately — see its 15-s frame-appear and 30-s token-poll timeouts.
