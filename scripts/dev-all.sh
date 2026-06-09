#!/usr/bin/env bash
# Local dev: backend (watch) + Vite (:5187) + TMA dist rebuild (for tunnel/Telegram).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Initial TMA build (for https://cursorremote.yatrade.org via :4871)…"
npm run build:tma

echo "→ Starting backend (:4871), Vite (:5187), and watch:tma…"
echo "  Chrome:  http://localhost:5187"
echo "  Tunnel:  run 'npm run tunnel' in another terminal (serves tma/dist from :4871)"
trap 'kill 0 2>/dev/null' EXIT INT TERM

MOCK_TG=true npm run dev:server &
npm run dev:chrome &
npm run watch:tma &

wait
