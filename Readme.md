# PayBack Coupons Activator

The software is a coupon activation tool that automates the process of redeeming coupons on [PayBack](https:/payback.de). With this software, users can easily activate all their available coupons with just a few clicks, eliminating the need for manual input and saving time. The software is designed to be user-friendly and easy to operate, making it accessible to individuals with varying levels of technical expertise. Users can simply input their login credentials and select the coupons they want to activate, and the software will handle the rest.

## Installation

For usage of the project you need [Node](https://nodejs.org/en/download/) & [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) installed on your machine.
The minimal required version of [Node](https://nodejs.org/en/download/) is 18 and for [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) is 9.

```sh
cd payback-coupons-activator
npm install
```

## Usage

### Preparing

Edit the following file `.env` with your editor of choice.

Replace the variables with your own data.

```bash
userEmailOrId="TYPE_YOUR_ID_OR_EMAIL"
userPassword="TYPE_YOUR_PASSWORD"
```

### Headless versus Browser mode

By default, the script is executed in the "headless" mode, i.e. in the background.

If you want to see what actually is being done, you have to change the value of `mode` in the `.env` file from `prod` to `dev`.

### Run

If you want to start the script, you have to execute the following command in the terminal.

```sh
npm run activatePaybackCoupons
```

## Contributing

[Pull-Request](https://github.com/alex-messer/payback-coupons-activator/pulls) are welcome.

For major changes, please open an [Issue](https://github.com/alex-messer/payback-coupons-activator/pulls) first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## Debugging

For debugging purposes you should run following command

```sh
npm run activatePaybackCoupons:debug
```

## Fork

- [KirDe](https://github.com/KirDE/payback-coupon-activator-userjs) for Browser usage with [tampermonkey](https://www.tampermonkey.net/) or Greasemonkey.

## License

[The Unlicense](https://choosealicense.com/licenses/unlicense/)
