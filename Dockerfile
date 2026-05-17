FROM node:24-bookworm-slim

# Install Firefox system deps, cron, ffmpeg (recaptcha-solver) and tzdata
# (required for the cron daemon to honour the TZ env var)
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron ffmpeg tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && npx -y playwright@1.60.0 install --with-deps firefox

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci

# Copy only what's needed to run tests
COPY src/ ./src/
COPY playwright.config.ts eslint.config.mjs jsconfig.json ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
