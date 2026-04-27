# PayBack Coupons Activator

The software is a coupon activation tool that automates the process of redeeming coupons on [PayBack](https://payback.de). With this software, users can easily activate all their available coupons with just a few clicks, eliminating the need for manual input and saving time. The software is designed to be user-friendly and easy to operate, making it accessible to individuals with varying levels of technical expertise. Users can simply input their login credentials and select the coupons they want to activate, and the software will handle the rest.

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

| Variable             | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `mode`               | `production` (headless) or `debug`                                           |
| `userEmailOrId`      | Your PayBack email or customer number                                        |
| `userPassword`       | Your PayBack password                                                        |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token (optional, from [@BotFather](https://t.me/BotFather)) |
| `TELEGRAM_CHAT_ID`   | Your Telegram chat ID (optional, for notifications)                          |

### Run

```sh
npm run activatePaybackCoupons
```

### Headed mode (visible browser)

```sh
npm run activatePaybackCoupons:headed
```

### Debugging

```sh
npm run activatePaybackCoupons:debug
```

### Docker

```sh
docker compose up --build
```

The container runs the script once on startup and then daily at 08:00 via cron.

### Bot detection & CAPTCHA handling

Headless / Docker runs are more likely to trigger PayBack's reCAPTCHA v2 image challenge. Two layers mitigate this:

1. **Stealth** — the browser is launched via [`playwright-extra`](https://www.npmjs.com/package/playwright-extra) + [`puppeteer-extra-plugin-stealth`](https://www.npmjs.com/package/puppeteer-extra-plugin-stealth) (Chromium only). Patches typical automation fingerprints (`navigator.webdriver`, WebRTC, etc.) to reduce the chance that a CAPTCHA is presented in the first place.
2. **Offline solver** — when a reCAPTCHA still appears, [`recaptcha-solver`](https://www.npmjs.com/package/recaptcha-solver) uses the audio challenge and an offline Vosk speech-to-text model to solve it automatically. Requires `ffmpeg` on the system PATH (already installed in the Docker image).

## Contributing

[Pull-Request](https://github.com/alex-messer/payback-coupons-activator/pulls) are welcome.

For major changes, please open an [Issue](https://github.com/alex-messer/payback-coupons-activator/issues) first to discuss what you would like to change.

## Fork

- [KirDe](https://github.com/KirDE/payback-coupon-activator-userjs) for Browser usage with [tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)
