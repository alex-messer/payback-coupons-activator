#!/bin/bash
set -e

# Export current env vars so cron jobs can access them
printenv | grep -E '^(userEmailOrId|userPassword|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DISPLAY|mode|HOME|PATH|NODE_PATH)=' > /app/.env.cron

# Create daily cron job (runs at 08:00)
echo "0 8 * * * cd /app && export \$(cat /app/.env.cron | xargs) && node node_modules/.bin/playwright test src/index.spec.ts >> /var/log/payback.log 2>&1" | crontab -

# Start cron in background
cron

echo "Cron scheduled: daily at 08:00"
echo "Running initial activation now..."

# Run once immediately
node node_modules/.bin/playwright test src/index.spec.ts "$@"

# Keep container alive for cron
echo "Waiting for next scheduled run..."
tail -f /var/log/payback.log 2>/dev/null || sleep infinity
