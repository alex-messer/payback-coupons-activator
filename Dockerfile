FROM node:24-bookworm-slim

# System deps:
# - cron / tzdata: scheduled daily run (entrypoint installs a crontab)
# - ffmpeg: kept for the legacy recaptcha-solver smoke test
# - libgtk-3-0, libx11-xcb1, libasound2, libdbus-glib-1-2, libxt6, xvfb,
#   fonts-liberation: Camoufox (Firefox-fork) runtime deps. xvfb is needed
#   because Camoufox is launched headlessly here, but its Firefox backend
#   still touches X11 on first init.
# Bookworm ships glibc 2.36, satisfying the `impit` native binding's glibc
# >= 2.33 requirement. Do NOT downgrade the base image to bullseye — local
# WSL Ubuntu 20.04 (glibc 2.31) is unsupported for the same reason.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        cron \
        ffmpeg \
        tzdata \
        libgtk-3-0 \
        libx11-xcb1 \
        libasound2 \
        libdbus-glib-1-2 \
        libxt6 \
        xvfb \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (cached layer).
# WORKAROUND: the recaptcha-solver postinstall downloads a Vosk model from
# alphacephei.com, whose TLS certificate expired on 2026-05-16. npm-registry
# packages are still safe here because npm ci verifies package-lock.json
# integrity hashes independently of TLS. Remove the env override once the
# upstream cert is renewed.
COPY package.json package-lock.json ./
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci

# Install the real Google Chrome channel plus its system dependencies.
# Patchright requires the Chrome channel and a headful launch for full stealth;
# the headful browser renders on the Xvfb virtual display started by
# entrypoint.sh.
RUN npx patchright install --with-deps chrome

# Copy only what's needed to run tests
COPY src/ ./src/
COPY playwright.config.ts eslint.config.mjs jsconfig.json ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
