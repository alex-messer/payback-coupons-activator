#!/bin/bash
set -e

# Apply the TZ env var to the system clock so the cron daemon fires at the
# expected local time. Without this, cron ignores $TZ and runs on UTC.
if [ -n "$TZ" ] && [ -f "/usr/share/zoneinfo/$TZ" ]; then
    ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
    echo "$TZ" > /etc/timezone
fi

# Patchright launches a headful Chrome (required for full stealth), which needs
# an X display. Start a virtual one and export DISPLAY before the cron env is
# captured below, so both the immediate run and the daily cron job inherit it.
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1280x720x24 >/var/log/xvfb.log 2>&1 &
export DISPLAY=:99
sleep 1

# Export current env vars so cron jobs can access them
printenv | grep -E '^(userEmailOrId|userPassword|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DISPLAY|mode|HOME|PATH|NODE_PATH|TZ)=' > /app/.env.cron

# Create daily cron job (runs at 07:00)
echo "0 7 * * * cd /app && export \$(cat /app/.env.cron | xargs) && node node_modules/.bin/playwright test src/index.spec.ts >> /var/log/payback.log 2>&1" | crontab -

# Start cron in background
cron

echo "Cron scheduled: daily at 07:00"
echo "Running initial activation now..."

# Run once immediately
node node_modules/.bin/playwright test src/index.spec.ts "$@"

# Keep container alive for cron
echo "Waiting for next scheduled run..."
tail -f /var/log/payback.log 2>/dev/null || sleep infinity
