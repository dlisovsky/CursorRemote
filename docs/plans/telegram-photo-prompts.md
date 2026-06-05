# Plan: Telegram photo prompts → Cursor

**Status: implemented** (2026-06-05). Full archive: `~/.gstack/projects/dlisovsky-CursorRemote/specs/20260605-telegram-photo-prompts.md`

## Summary

Send one or more photos from a mapped Telegram topic (with optional caption) into the Cursor agent composer as a single prompt — same workflow as paste in the Cursor UI. Auto-submit after attach (like voice).

## Acceptance (quick)

- 1 photo + caption → one agent prompt with image + text
- 3-photo album + caption → one prompt, 3 images
- Photo-only → works without caption
- Unmapped topic / disabled flag → clear Telegram reply

## Blocker before code

Run `npm run discover` to find how Cursor's composer accepts image attachments via CDP.

## Key files

- `src/server/transports/telegram/commands.ts` — handlers
- `src/server/command-executor.ts` — `sendPrompt` with attachments
- `src/server/transports/telegram/voice-download.ts` — pattern for download
- `telegram/index.ts`, `telegram-raw/index.ts` — wire handlers
