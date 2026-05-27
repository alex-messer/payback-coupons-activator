# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

Automates activating all available coupons on payback.de. Despite using Playwright Test as the runner, this is **not a test suite** — `src/index.spec.ts` is the production entry point, executed once per run (manually or via cron in Docker). Smoke tests under `src/__smoke__/` verify that supporting infrastructure (browser fixture, captcha solver dependencies) still works, and are not part of the regular run.

PayBack's login is now gated by Cloudflare Turnstile (sitekey `0x4AAAAAAB-_3aTRuD_6zxxk`, hidden input `botProtectionResponse`), which the legacy Vosk-based reCAPTCHA solver cannot clear. The workaround is to run the production browser as **Camoufox** (Firefox fork with C++ fingerprint injection from `camoufox-js`) so Cloudflare scores the session as trustworthy and a single managed click on the Turnstile checkbox is enough to issue a token. The managed-click flow is best-effort: if Cloudflare still scores the session as a bot, the operator sees a German error suggesting 2Captcha or seed-session.

## Commands

Runs require credentials in `.env.local` (copy from `.env`). Both files are loaded via `node --env-file=`. The `mode` env var (`production` | anything else) toggles headless and Playwright retries.

```sh
npm run activatePaybackCoupons          # Main run (headless when mode=production)
npm run activatePaybackCoupons:headed   # Visible browser
npm run activatePaybackCoupons:debug    # Playwright inspector

npm run smoke                           # Run all smoke tests in src/__smoke__/
npm run smoke:headed
node --env-file=.env node_modules/.bin/playwright test src/__smoke__/stealth.spec.ts   # Single smoke test

npm run check:eslint                    # Lint
npm run check:prettier                  # Format check
npm run lint:eslint                     # Lint + autofix
npm run lint:prettier                   # Format write
```

Docker runs the script once on container start, then daily at 07:00 via cron (`entrypoint.sh`):

```sh
docker compose up --build
```

Husky hooks (`pre-commit` runs `lint-staged`, `commit-msg` runs commitlint with conventional commits). Hooks source `.husky/setup-node.sh` to force nvm-managed Node 24 onto PATH — distro Node may otherwise be too old. Commit messages must follow `@commitlint/config-conventional`.

## Architecture

The flow is a single Playwright test (`src/index.spec.ts`) wired together from three layers:

**1. Browser fixture** (`src/fixtures/browser.fixture.ts`) — overrides Playwright's default browser launch. **Camoufox** is used (a Firefox fork with C++-level fingerprint injection from the `camoufox-js` package, not vanilla Playwright Firefox or Chromium). PayBack now sits behind Cloudflare Turnstile, which scored vanilla Firefox/Chromium sessions too aggressively; Camoufox's residential-Firefox fingerprint clears Turnstile reliably without an external solver. Launch options live in `camoufoxLaunchOptions()`: `os: "linux"`, `humanize: 1.2`, `window: [1280, 720]`, `block_webrtc: true`. The `locale` option is INTENTIONALLY omitted because camoufox-js v0.10.x has a known bug in `StatisticalLocaleSelector` that throws `TypeError: Cannot read properties of undefined (reading 'territoryInfo')` when locale is passed. `playwright.config.ts` only supplies viewport/device defaults; **do not** rely on its `use.headless` — the fixture launches its own and reads `process.env.mode === "production"` to decide headlessness. Worker-scoped, so the same browser is reused across tests in a worker.

**2. Page objects** (`src/pages/`) — encapsulate the two PayBack screens the script touches.

- `login.page.ts`: Two-step login (identification → password). Between the two steps, PayBack injects a Cloudflare Turnstile widget. `solveTurnstileAndSubmit()` presses Enter on the email field to trigger the widget, asks `TurnstileService` to clear it via a managed click, and clicks "Weiter" once the token is issued. If the managed click fails, it throws a German error (`"Cloudflare Turnstile konnte nicht gelöst werden — …"`). `waitForPasswordStep()` polls for the password field and re-runs the managed click if Turnstile re-appears (rare server-side retry). After password submit, `waitForLoginComplete()` keeps polling because PayBack can inject another Turnstile widget on the password step — a plain `waitForURL` would just sit there. Login is considered complete when the URL no longer starts with `/login` (so 2FA delays are tolerated up to `LOGIN_TIMEOUT` = 5 min).
- `coupon.page.ts`: Activates not-yet-activated coupons identified by `data-testid="coupon-button-*-not_activated"`. After every `BATCH_SIZE` (35) clicks the page is reloaded and `activateAllCoupons()` recurses — PayBack's UI lazy-loads more coupons after a reload, so without this the loop would terminate prematurely. Returns the running total.

**3. Services** (`src/services/`)

- `turnstile.service.ts`: Cloudflare Turnstile detector + managed-click flow. `isPresent()` scans `page.frames()` for URLs under `challenges.cloudflare.com` (the iframe contents live in a closed shadow DOM that `document.querySelectorAll` can't reach). `hasToken()` reads `input[name="botProtectionResponse"]`. `solveIfPresent()` waits for the Turnstile frame, computes the checkbox position from the iframe bounding box (offset 30, 32), moves the cursor in 24 steps from a point ~80 px outside the box (approximating a human flick), clicks, and polls for the token up to 30 s. **No external solver.** Best-effort — if Cloudflare scores us as a bot the method returns `false` and the caller surfaces a German error.
- `captcha.service.ts`: **Legacy.** Wraps the `recaptcha-solver` package (offline Vosk audio solver). No longer wired into the login flow (PayBack moved from reCAPTCHA to Turnstile), but the file is retained for reference and its smoke test still verifies the ffmpeg/Vosk toolchain.
- `telegram.service.ts`: Optional notifier. Silently no-ops when `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset. Also polls `getUpdates` and deletes any messages from chat IDs other than the configured owner — this is how the bot stays effectively private without server-side ACLs.

The orchestrating test (`src/index.spec.ts`) chooses the Telegram message based on three counts: `totalBefore` (available coupons before activation), `activated` (clicks performed), `allDone` (the "no coupons left" headline visible). Errors are caught, sent to Telegram (truncated), and re-thrown so Playwright marks the run failed.

## Style

- TypeScript, ESM. ESLint: 2-space indent, double quotes, semicolons, unix line endings. Prettier: 120-col print width, trailing commas everywhere, no single quotes.
- Test files end in `.spec.ts`. Smoke tests live in `src/__smoke__/` so they're reachable via `npm run smoke` without dragging them into the production run.
- Selectors are colocated as `const Selectors = { ... } as const` at the top of each page object.

## Gotchas

- `npm install` triggers a `recaptcha-solver` postinstall that downloads a ~40 MB Vosk model. Slow networks may need a retry; verify with `npm run smoke -- src/__smoke__/captcha.spec.ts`.
- **Camoufox needs glibc ≥ 2.33.** Bookworm/Debian 12 (the Docker base) ships glibc 2.36 and works. **WSL Ubuntu 20.04 (glibc 2.31) is NOT supported for local Camoufox runs** — the native `impit` binding fails to load with `"impit couldn't load native bindings"`. Local development must either upgrade WSL to 22.04+ or run everything inside Docker. The TypeScript still compiles on glibc 2.31; only the runtime fails.
- The Camoufox binary (~750 MB) is downloaded into `~/.cache/camoufox` by `npx camoufox-js fetch`. The Dockerfile runs this during the image build; for local runs the same command must be executed once after `npm install` (and only on a supported glibc).
- The Turnstile managed-click in `turnstile.service.ts` is **best-effort**: it relies on Camoufox's fingerprint being good enough for Cloudflare to issue a token after one click. When that fails the user sees the German error `"Cloudflare Turnstile konnte nicht gelöst werden — Camoufox-Fingerprint reicht nicht. Erwäge 2Captcha oder seed-session."` — at which point an external solver or a seeded session is required.
- `BATCH_SIZE = 35` in `coupon.page.ts` is empirical — PayBack throttles or stops rendering new coupons past this count without a reload. Don't raise it without testing.
- The login `LOGIN_TIMEOUT` of 5 minutes accommodates manual 2FA. If automating in fully headless contexts where 2FA isn't possible, the run will hang until that timeout expires.
- `playwright.config.ts` declares `fullyParallel: true` but `workers: 1` — the workflow is single-session by design (one PayBack login).
- `retries: 0` is intentional: rapid back-to-back login attempts trigger harder bot challenges on PayBack's side. A failed run waits for the next cron tick instead of retrying immediately.
- `actionTimeout: 0` (no per-action timeout) is intentional for slow coupon-page renders. The Turnstile service bounds itself separately — see its 15-s frame-appear and 30-s token-poll timeouts.
