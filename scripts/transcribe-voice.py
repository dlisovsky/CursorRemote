#!/usr/bin/env python3
"""Local voice transcription via faster-whisper. Prints one JSON line to stdout."""

import argparse
import json
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("audio_path", help="Path to audio file (OGG, MP3, WAV, etc.)")
    parser.add_argument("--model", default="small", help="Whisper model size (default: small)")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper not installed. Run:\n"
            "  python3 -m venv ~/.cursor-remote-transcribe\n"
            "  source ~/.cursor-remote-transcribe/bin/activate\n"
            "  pip install faster-whisper",
            file=sys.stderr,
        )
        return 1

    start = time.time()
    try:
        print(f"Loading Whisper model '{args.model}' (first run downloads ~500MB)...", file=sys.stderr, flush=True)
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
        print("Model loaded, transcribing...", file=sys.stderr, flush=True)
        segments, info = model.transcribe(args.audio_path, language=None)
        text = " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    duration_ms = int((time.time() - start) * 1000)
    payload = {
        "text": text,
        "language": info.language if info.language else "unknown",
        "duration_ms": duration_ms,
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
