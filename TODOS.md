# TODOS

## Voice message + photo attachment support — **shipped**

- TMA composer: microphone (record → faster-whisper transcription) and camera/photo picker
- Backend: `POST /agents/:id/transcribe`, attachments on `POST /agents/:id/send`
- Images saved to `{project}/.cursor-remote/inbox/` and referenced in the SDK prompt
- Configure via `.env`: `TRANSCRIBE_MODEL`, `TRANSCRIBE_LANGUAGES`, `VOICE_ENABLED`, `PHOTOS_ENABLED`

## Design (done)

- [x] `/design-review` UI/UX pass — see `DESIGN.md` and `.gstack/design-reports/`
- [x] Tool card status labels (`Running` vs `running`) — fixed in /qa
- [ ] Telegram haptic on send/stop — polish

## Future ideas

- Cloud agent runtime (`Agent.create({ cloud })`) for phone control when laptop sleeps
- File diff viewer in run detail
