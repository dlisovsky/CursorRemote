# Changelog

## 0.2.0.0 — 2026-06-09

### Added

- **Telegram Mini App** (React + Mantine) — project list, agent chat, streaming tool cards, queue UI, stop/cancel
- **Express + WebSocket backend** orchestrating `@cursor/sdk` agents (create, send, stream, cancel, resume)
- **SQLite agent registry** with run event replay on reconnect
- **IDE session import** — surface Cursor composer chats from local transcript files
- **Voice transcription** — record in TMA, transcribe via faster-whisper, send to agent
- **Photo attachments** — camera/library picker, saved to `.cursor-remote/inbox/`
- **Mock Telegram mode** — `MOCK_TG` / `VITE_MOCK_TG` for Chrome dev and Playwright QA
- **Cloudflare tunnel** dev workflow (`npm run tunnel`, `npm run dev:all`)
- Vitest unit tests (26) and Playwright E2E smoke test
- `DESIGN.md` design system; `npm run sdk:smoke` connectivity check

### Changed

- Clean break from CDP-scraping VS Code extension architecture
- Projects discovered via explicit `PROJECT_PATHS` (not filesystem scan)
- Ports: backend `:4871`, Vite dev `:5187`

### Security

- Require `JWT_SECRET` when `MOCK_TG` is not true
- Refuse startup when `MOCK_TG=true` and `TELEGRAM_BOT_TOKEN` are both set (tunnel exposure)
- Fix `forceSendQueued` race — dequeue before cancel, wait for idle before send

### Removed

- CDP bridge, DOM scraping, VS Code extension host
- Legacy web client and forum-topic Telegram message transport
