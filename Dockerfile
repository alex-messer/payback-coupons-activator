FROM node:24-bookworm-slim

# Install Firefox system deps, cron, ffmpeg (recaptcha-solver) and tzdata
# (required for the cron daemon to honour the TZ env var)
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron ffmpeg tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && npx -y playwright@1.60.0 install --with-deps firefox

WORKDIR /app

# Install dependencies (cached layer).
# WORKAROUND: the recaptcha-solver postinstall downloads a Vosk model from
# alphacephei.com, whose TLS certificate expired on 2026-05-16. npm-registry
# packages are still safe here because npm ci verifies package-lock.json
# integrity hashes independently of TLS. Remove the env override once the
# upstream cert is renewed.
COPY package.json package-lock.json ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci

# Copy only what's needed to run tests
COPY src/ ./src/
COPY playwright.config.ts eslint.config.mjs jsconfig.json ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
