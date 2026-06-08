# TODOS

## Voice message + photo attachment support (v2)

**What:** Add voice recording and photo/screenshot attachment to the TMA composer.

**Why:** Natural mobile interaction -- speak your prompt while walking, snap a screenshot
of a bug. The prior CursorRemote had voice transcription (Whisper-based). The SDK's
`agent.send()` likely accepts text only -- voice needs transcription on the backend
before sending to SDK. Photos may need to be encoded as base64 or uploaded to a URL
the agent can access.

**Prior art:** Commits on `feature/upds` branch show "Enhance voice transcription and
live feed management" -- transcription pipeline existed in the CDP era.

**Depends on:** Wedge shipping, SDK multimodal/attachment support.
