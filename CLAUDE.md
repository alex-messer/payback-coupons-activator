# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

Automates activating all available coupons on payback.de. Despite using Playwright Test as the runner, this is **not a test suite** — `src/index.spec.ts` is the production entry point, executed once per run (manually or via cron in Docker). Smoke tests under `src/__smoke__/` verify that supporting infrastructure (stealth fixture, captcha solver dependencies) still works, and are not part of the regular run.

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

**1. Stealth fixture** (`src/fixtures/stealth.fixture.ts`) — overrides Playwright's default browser launch. The actual Chromium is spun up via `playwright-extra` + `puppeteer-extra-plugin-stealth` so anti-bot fingerprints (`navigator.webdriver`, WebRTC, plugin list, etc.) are patched. `playwright.config.ts` only supplies viewport/device defaults; **do not** rely on its `use.headless` to launch the browser — the fixture launches its own and reads `process.env.mode === "production"` to decide headlessness. Worker-scoped, so the same browser is reused across tests in a worker.

**2. Page objects** (`src/pages/`) — encapsulate the two PayBack screens the script touches.

- `login.page.ts`: Two-step login (identification → password). Between the two steps, PayBack may inject reCAPTCHA. `waitForPasswordStep()` polls for the password field and, on each iteration, asks `CaptchaService` to solve a captcha if one is present, and re-fills the email field if the page reloaded after a failed challenge. The login is considered complete only when the URL no longer starts with `/login` (so 2FA delays are tolerated up to `LOGIN_TIMEOUT` = 5 min).
- `coupon.page.ts`: Activates not-yet-activated coupons identified by `data-testid="coupon-button-*-not_activated"`. After every `BATCH_SIZE` (35) clicks the page is reloaded and `activateAllCoupons()` recurses — PayBack's UI lazy-loads more coupons after a reload, so without this the loop would terminate prematurely. Returns the running total.

**3. Services** (`src/services/`)

- `captcha.service.ts`: Wraps the `recaptcha-solver` package (offline Vosk audio solver). **Never throws** — all errors are logged and surface as `false`, so the caller's polling loop keeps trying. Has a fast path that detects an already-set `g-recaptcha-response` token and skips solving. Requires `ffmpeg` on PATH and the Vosk model under `node_modules/recaptcha-solver/model/` (verified by `__smoke__/captcha.spec.ts`).
- `telegram.service.ts`: Optional notifier. Silently no-ops when `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset. Also polls `getUpdates` and deletes any messages from chat IDs other than the configured owner — this is how the bot stays effectively private without server-side ACLs.

The orchestrating test (`src/index.spec.ts`) chooses the Telegram message based on three counts: `totalBefore` (available coupons before activation), `activated` (clicks performed), `allDone` (the "no coupons left" headline visible). Errors are caught, sent to Telegram (truncated), and re-thrown so Playwright marks the run failed.

## Style

- TypeScript, ESM. ESLint: 2-space indent, double quotes, semicolons, unix line endings. Prettier: 120-col print width, trailing commas everywhere, no single quotes.
- Test files end in `.spec.ts`. Smoke tests live in `src/__smoke__/` so they're reachable via `npm run smoke` without dragging them into the production run.
- Selectors are colocated as `const Selectors = { ... } as const` at the top of each page object.

## Gotchas

- `npm install` triggers a `recaptcha-solver` postinstall that downloads a ~40 MB Vosk model. Slow networks may need a retry; verify with `npm run smoke -- src/__smoke__/captcha.spec.ts`.
- `BATCH_SIZE = 35` in `coupon.page.ts` is empirical — PayBack throttles or stops rendering new coupons past this count without a reload. Don't raise it without testing.
- The login `LOGIN_TIMEOUT` of 5 minutes accommodates manual 2FA. If automating in fully headless contexts where 2FA isn't possible, the run will hang until that timeout expires.
- `playwright.config.ts` declares `fullyParallel: true` but `workers: 1` — the workflow is single-session by design (one PayBack login).
