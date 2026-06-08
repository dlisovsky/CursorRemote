# TODOS

## Voice message + photo attachment support — **shipped**

- TMA composer: microphone (record → faster-whisper transcription) and camera/photo picker
- Backend: `POST /agents/:id/transcribe`, attachments on `POST /agents/:id/send`
- Images saved to `{project}/.cursor-remote/inbox/` and referenced in the SDK prompt
- Configure via `.env`: `TRANSCRIBE_MODEL`, `TRANSCRIBE_LANGUAGES`, `VOICE_ENABLED`, `PHOTOS_ENABLED`

## Future ideas

- Cloud agent runtime (`Agent.create({ cloud })`) for phone control when laptop sleeps
- File diff viewer in run detail
