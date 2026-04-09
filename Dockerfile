FROM node:24-bookworm-slim

# Install only Firefox, its system dependencies, and cron
RUN apt-get update \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/* \
    && npx -y playwright@1.59.1 install --with-deps firefox

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy only what's needed to run tests
COPY src/ ./src/
COPY playwright.config.ts eslint.config.mjs jsconfig.json ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
