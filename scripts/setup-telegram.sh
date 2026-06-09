#!/usr/bin/env bash
# Configure BotFather menu button + verify tunnel health.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

PUBLIC_URL="${PUBLIC_URL:-https://cursorremote.yatrade.org}"
BOT_USERNAME="${TELEGRAM_BOT_USERNAME:-MyRemoteAgenBot}"
MENU_LABEL="${TELEGRAM_MENU_LABEL:-CursorRemote}"

echo "=== CursorRemote Telegram Mini App setup ==="
echo ""
echo "Public URL:  $PUBLIC_URL"
echo "Bot:         @${BOT_USERNAME}"
echo ""
echo "1) Open @BotFather → /myapps → select your bot"
echo "2) Set Web App URL to: $PUBLIC_URL"
echo ""

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN not set in .env — skipping API calls"
  exit 0
fi

echo "Checking ${PUBLIC_URL}/health …"
if curl -sf --max-time 10 "${PUBLIC_URL}/health" | grep -q '"ok":true'; then
  echo "✓ Tunnel + backend reachable"
else
  echo "✗ ${PUBLIC_URL}/health failed — run: npm run dev:telegram && npm run tunnel"
  exit 1
fi

echo ""
echo "Setting menu button via Bot API …"
curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"${MENU_LABEL}\",\"web_app\":{\"url\":\"${PUBLIC_URL}\"}}}" \
  | grep -q '"ok":true' && echo "✓ Menu button → ${PUBLIC_URL}" || echo "✗ Menu button API failed"
