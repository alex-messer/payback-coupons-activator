FROM node:24-bookworm-slim

# Install Chromium system deps, cron and ffmpeg (required by recaptcha-solver)
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && npx -y playwright@1.59.1 install --with-deps chromium

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
