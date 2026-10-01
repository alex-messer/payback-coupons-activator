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

### Debugging

Use IDE breakpoints. `npm run activatePaybackCoupons:debug` (Playwright Inspector) is **incompatible with Patchright**: the Inspector's CDP usage conflicts with Patchright's CDP patch.

### Bot detection & CAPTCHA handling

PayBack's login is gated by a Cloudflare Turnstile widget. The browser runs via [`patchright`](https://www.npmjs.com/package/patchright), an undetected Playwright fork that closes the CDP automation leak Cloudflare uses to flag bots — this makes Cloudflare score the session as trustworthy and **auto-issue the Turnstile token**, no challenge-solving needed. If a token isn't auto-issued, a click on the checkbox is attempted as a fallback. If that also fails, you get a Telegram notice (when configured) and 2 minutes to solve the widget manually in the open browser window; if no token appears, the run throws.

The Chrome profile is persistent (`~/.payback-coupons-activator/chrome-profile`), so Cloudflare trust and a still-valid PayBack session carry over between runs; login is skipped when the session is active. Delete that directory only if the profile gets corrupted.

An older reCAPTCHA v2 audio solver ([`recaptcha-solver`](https://www.npmjs.com/package/recaptcha-solver), offline Vosk speech-to-text, requires `ffmpeg` on PATH) is kept in the codebase for reference but is no longer wired into the login flow. Only its smoke test (`npm run smoke`) still checks the toolchain, so that test fails if `ffmpeg` is missing — this does not affect the normal run.

## Contributing

[Pull-Request](https://github.com/alex-messer/payback-coupons-activator/pulls) are welcome.

For major changes, please open an [Issue](https://github.com/alex-messer/payback-coupons-activator/issues) first to discuss what you would like to change.

## Fork

- [KirDe](https://github.com/KirDE/payback-coupon-activator-userjs) for Browser usage with [tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)
