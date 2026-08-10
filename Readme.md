# PayBack Coupons Activator

The software is a coupon activation tool that automates the process of redeeming coupons on [PayBack](https://payback.de). Provide your login credentials and run the script — it logs in and activates every available coupon automatically, no manual clicking or selection required.

## Installation

For usage of the project you need [Node](https://nodejs.org/en/download/) & [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) installed on your machine.
The minimal required version of [Node](https://nodejs.org/en/download/) is 24 and for [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) is 11.

```sh
cd payback-coupons-activator
npm install
```

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

```sh
npm run activatePaybackCoupons:debug
```

### Bot detection & CAPTCHA handling

PayBack's login is gated by a Cloudflare Turnstile widget. The browser runs via [`patchright`](https://www.npmjs.com/package/patchright), an undetected Playwright fork that closes the CDP automation leak Cloudflare uses to flag bots — this makes Cloudflare score the session as trustworthy and **auto-issue the Turnstile token**, no challenge-solving needed. If a token isn't auto-issued, a managed human-like click on the checkbox is attempted as a fallback; if that also fails, the run throws.

An older reCAPTCHA v2 audio solver ([`recaptcha-solver`](https://www.npmjs.com/package/recaptcha-solver), offline Vosk speech-to-text, requires `ffmpeg` on PATH) is kept in the codebase for reference but is no longer wired into the login flow.

## Contributing

[Pull-Request](https://github.com/alex-messer/payback-coupons-activator/pulls) are welcome.

For major changes, please open an [Issue](https://github.com/alex-messer/payback-coupons-activator/issues) first to discuss what you would like to change.

## Fork

- [KirDe](https://github.com/KirDE/payback-coupon-activator-userjs) for Browser usage with [tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)
