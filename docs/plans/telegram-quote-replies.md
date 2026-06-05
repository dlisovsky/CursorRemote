# Plan: Telegram quote replies → Cursor (Phase A)

**Status: Phase A implemented**

## Summary

When the user quotes part of an agent Telegram message and replies, forward the selection to Cursor as a plain-text prompt with a **Regarding** block. Phase B would insert a native composer `blockquote` via CDP.

## Phase A (done)

- Parse `message.quote.text` (partial selection) and `reply_to_message` (full-message fallback).
- Format: `Regarding:\n\n«quoted»\n\n<user text>`
- Wired for text, voice (after transcribe), and photo captions.
- Grammy + raw transport field mapping.

## Phase B (later)

- `npm run discover` — insert ProseMirror blockquote in composer.
- Optional: cache `telegramMsgId → plainText` in MessageTracker for richer fallbacks.

## Acceptance

- Quote-selected text on agent message + reply → Cursor prompt includes quote.
- Reply without selection → full replied message used as quote context.
- Quote-only message (no new text) still sends.
