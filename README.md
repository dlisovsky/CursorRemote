# CursorRemote

Control Cursor agents from Telegram (Mini App) or Chrome during development.

**Architecture:** TMA (React) → Backend (Express + WS) → Cursor SDK. The TMA never talks to Cursor directly.

## Requirements

- Node.js 22+ (uses built-in `node:sqlite`)
- [Cursor API key](https://cursor.com/settings)
- Telegram bot token (production only)

## Quick start

```bash
cp .env.example .env
# Set CURSOR_API_KEY and PROJECT_PATHS (MOCK_TG=true and VITE_MOCK_TG=true by default)

npm install
npm run dev:server   # terminal 1 — backend (:4871), accepts mock + real TG auth
npm run dev:tma      # terminal 2 — Vite dev server (:5187)
```

**Chrome:** open http://localhost:5187 — uses mock initData automatically.

**Telegram Mini App:** `npm run dev:telegram` + `npm run tunnel`, open via your bot — uses real initData; native MainButton/back UI activates automatically.

Both work at the same time when `MOCK_TG=true` (backend accepts mock and validates real HMAC).

## Environment

| Variable | Description |
|----------|-------------|
| `CURSOR_API_KEY` | Cursor API key (required) |
| `CURSOR_MODEL` | Default `composer-2.5` |
| `PROJECT_PATHS` | Comma-separated absolute repo paths |
| `MOCK_TG` | `true` (default dev) — backend accepts mock initData **and** real Telegram HMAC |
| `VITE_MOCK_TG` | `true` (default dev) — Chrome falls back to mock; Mini App uses real initData when present |
| `TELEGRAM_BOT_TOKEN` | Bot token for real initData HMAC |
| `JWT_SECRET` | JWT signing secret |
| `PORT` | Backend port (default `4871`) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Backend API + WebSocket |
| `npm run dev:tma` | Vite dev server for TMA (Chrome dev at :5187) |
| `npm run dev:chrome:server` | Alias: backend with `MOCK_TG=true` forced |
| `npm run dev:chrome` | Alias: Vite with `VITE_MOCK_TG=true` forced |
| `npm run build:tma` | Production TMA build (served by backend) |
| `npm run preview:sync` | Alias for `build:tma` — run after UI changes so tunnel shows latest |
| `npm run watch:tma` | Rebuild TMA on file changes (use with Telegram tunnel) |
| `npm run dev:all` | Backend + Vite (:5187) + `watch:tma` (one command for local dev) |
| `npm run tunnel` | Cloudflare tunnel → localhost:4871 |
| `npm run dev:telegram` | Build TMA + start backend for Telegram |
| `npm run setup:telegram` | Verify tunnel health + set bot menu button |
| `npm run sdk:smoke` | Verify Cursor SDK connectivity |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E (starts servers) |
| `npm run typecheck` | TypeScript check |

## Telegram Mini App (production)

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` and `PROJECT_PATHS` in `.env` (keep `MOCK_TG=true` for dev, or set both mock flags `false` for production-only auth)
3. One-time Cloudflare tunnel (if not already created):
   ```bash
   cloudflared tunnel create cursorremote
   cloudflared tunnel route dns cursorremote cursorremote.yourdomain.com
   ```
   Config lives in `.cloudflared/cursorremote.yml`. Set `PUBLIC_URL` in `.env` to match the hostname.
4. Run backend + tunnel:
   ```bash
   npm run dev:telegram   # builds TMA + starts API on :4871
   npm run tunnel         # HTTPS → localhost:4871
   npm run setup:telegram # verify health + set menu button
   ```
5. In BotFather → /myapps → Web App URL = `PUBLIC_URL` (e.g. `https://cursorremote.yatrade.org`)

While iterating on TMA UI for Telegram, run `npm run watch:tma` in a third terminal to auto-rebuild `tma/dist`.

The backend serves the built TMA from `tma/dist` on the same origin (API + WebSocket work over the tunnel).

## Project layout

```
shared/     Wire protocol types
server/     Express API, SDK orchestrator, SQLite registry
tma/        React + Mantine Telegram Mini App
tests/      Vitest unit tests
e2e/        Playwright smoke tests
```

## Features

- Project list from `PROJECT_PATHS`
- Per-project agents via Cursor SDK
- Real-time streaming (tools, thinking, assistant text)
- Stop run, prompt queue, force-send, cancel queued
- Chat history replay on page reload

## Voice & photos

- **Microphone** — tap to record, tap again to transcribe (local faster-whisper) into the composer
- **Camera** — attach screenshots; saved under `{project}/.cursor-remote/inbox/` and included in the agent prompt

Requires `pip install faster-whisper` and `TRANSCRIBE_MODEL` in `.env`. Disable with `VOICE_ENABLED=false` or `PHOTOS_ENABLED=false`.
