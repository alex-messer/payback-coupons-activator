# PayBack Coupons Activator

The software is a coupon activation tool that automates the process of redeeming coupons on [PayBack](https://payback.de). Provide your login credentials and run the script — it logs in and activates every available coupon automatically, no manual clicking or selection required.

## Installation

For usage of the project you need [Node](https://nodejs.org/en/download/) & [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) installed on your machine.
The minimal required version of [Node](https://nodejs.org/en/download/) is 24 and for [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) is 11.

```sh
cd payback-coupons-activator
npm install
npx patchright install chrome
```

The browser is driven by [`patchright`](https://www.npmjs.com/package/patchright) and needs **real Google Chrome** (installed by the command above). For full stealth it always runs **headful**, so the machine needs a display (a normal desktop session, WSLg on WSL2, or a virtual one such as `Xvfb`).

## Usage

### Preparing

Copy `.env` to `.env.local` and replace the variables with your own data.

```bash
cp .env .env.local
```

```bash
mode="production"
userEmailOrId="TYPE_YOUR_ID_OR_EMAIL"
userPassword="TYPE_YOUR_PASSWORD"
TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
TELEGRAM_CHAT_ID="YOUR_TELEGRAM_CHAT_ID"
```

| Variable             | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `mode`               | `production` enables Playwright's `forbidOnly` check; the browser always runs headful either way |
| `userEmailOrId`      | Your PayBack email or customer number                                                            |
| `userPassword`       | Your PayBack password                                                                            |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token (optional, from [@BotFather](https://t.me/BotFather))                     |
| `TELEGRAM_CHAT_ID`   | Your Telegram chat ID (optional, for notifications)                                              |

### Run

```sh
npm run activatePaybackCoupons
```

The run opens a visible Chrome window, logs in (skipped when the persistent profile still has a valid session) and activates every coupon on the coupon page one by one. To work around PayBack throttling after many clicks, the coupon page is **reloaded after every 50 activations**; the total count carries over across reloads. A coupon that cannot be activated (click timeout, or it stays "not activated") is logged and skipped, not retried. A run with ~150 coupons takes roughly 5 minutes; Playwright's per-test timeout is 10 minutes.

If you don't need to watch it, leave the window open but untouched — **closing it aborts the run**. Don't re-run immediately after a failure: rapid back-to-back logins trigger harder bot challenges on PayBack's side (`retries` is fixed at 0 for the same reason).

### Telegram notifications

Optional — skipped silently when `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` are unset. Messages sent:

- **Success:** `N Coupons aktiviert.` (plus `Alle Coupons sind jetzt aktiviert.` when no coupons are left).
- **Nothing activated although coupons were available:** a warning with the number of available coupons.
- **Turnstile needs a manual solve:** a prompt to solve the checkbox in the browser window.
- **Error:** the (truncated) error message, plus `Bis dahin N Coupons aktiviert.` if some coupons were already activated before the failure.

Nothing is sent when there were no coupons to activate. After every notification the bot also deletes any messages sent to it from chat IDs other than `TELEGRAM_CHAT_ID`.

### Debugging

Use IDE breakpoints. `npm run activatePaybackCoupons:debug` (Playwright Inspector) is **incompatible with Patchright**: the Inspector's CDP usage conflicts with Patchright's CDP patch.

### Bot detection & CAPTCHA handling

PayBack's login is gated by a Cloudflare Turnstile widget. The browser runs via [`patchright`](https://www.npmjs.com/package/patchright), an undetected Playwright fork that closes the CDP automation leak Cloudflare uses to flag bots — this makes Cloudflare score the session as trustworthy and **auto-issue the Turnstile token**, no challenge-solving needed. If a token isn't auto-issued, the script gives the widget a few seconds to render and then clicks the checkbox (up to 3 attempts) as a fallback. If that also fails, you get a Telegram notice (when configured) and 2 minutes to solve the widget manually in the open browser window; if no token appears, the run throws.

The Chrome profile is persistent (`~/.payback-coupons-activator/chrome-profile`), so Cloudflare trust and a still-valid PayBack session carry over between runs; login is skipped when the session is active. Delete that directory only if the profile gets corrupted.

An older reCAPTCHA v2 audio solver ([`recaptcha-solver`](https://www.npmjs.com/package/recaptcha-solver), offline Vosk speech-to-text, requires `ffmpeg` on PATH) is kept in the codebase for reference but is no longer wired into the login flow. Only its smoke test (`npm run smoke`) still checks the toolchain, so that test fails if `ffmpeg` is missing — this does not affect the normal run.

## Development

```sh
npm run check:eslint     # lint
npm run check:prettier   # format check
npm run lint:eslint      # lint + autofix
npm run lint:prettier    # format write
npm run smoke            # smoke tests in src/__smoke__/ (browser fixture stealth check, captcha toolchain)
npm run smoke:headed
```

Smoke tests are not part of the regular run. The stealth test visits `bot.sannysoft.com` and needs network access; the captcha test needs `ffmpeg` (see above). Failed runs leave a Playwright trace and screenshot in `test-results/` and an HTML report in `playwright-report/`.

Husky runs `lint-staged` on commit and `commitlint` on the message, so commits must follow [Conventional Commits](https://www.conventionalcommits.org/). The GitHub Actions workflow (`.github/workflows/playwright.yml`) runs ESLint and Prettier on pushes and pull requests to `main`; it does not run the coupon activation or the smoke tests.

## Contributing

[Pull-Request](https://github.com/alex-messer/payback-coupons-activator/pulls) are welcome.

For major changes, please open an [Issue](https://github.com/alex-messer/payback-coupons-activator/issues) first to discuss what you would like to change.

## Fork

- [KirDe](https://github.com/KirDE/payback-coupon-activator-userjs) for Browser usage with [tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)
