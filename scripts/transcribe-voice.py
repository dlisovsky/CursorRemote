#!/usr/bin/env python3
"""Local voice transcription via faster-whisper. Prints one JSON line to stdout."""

import argparse
import json
import sys
import time


def parse_languages(raw: str) -> list[str]:
    langs = [part.strip().lower() for part in raw.split(",") if part.strip()]
    return langs if langs else ["en", "ru"]


def pick_allowed_language(model, audio_path: str, allowed: list[str]) -> str:
    from faster_whisper.audio import decode_audio

    allowed_set = set(allowed)
    audio = decode_audio(audio_path)
    _detected, _prob, all_probs = model.detect_language(audio)

    best_code: str | None = None
    best_prob = -1.0
    for code, p in all_probs:
        if code in allowed_set and p > best_prob:
            best_code = code
            best_prob = p

    if best_code:
        print(
            f"Language {best_code} (p={best_prob:.2f}) from allowed [{', '.join(allowed)}]",
            file=sys.stderr,
            flush=True,
        )
        return best_code

    # No probability mass on allowed langs — transcribe with first allowed (usually en).
    fallback = allowed[0]
    print(
        f"No allowed language scored strongly; using {fallback} (allowed: {', '.join(allowed)})",
        file=sys.stderr,
        flush=True,
    )
    return fallback


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("audio_path", help="Path to audio file (OGG, MP3, WAV, etc.)")
    parser.add_argument("--model", default="small", help="Whisper model size (default: small)")
    parser.add_argument(
        "--languages",
        default="en,ru",
        help="Comma-separated ISO codes; detection picks only among these (default: en,ru)",
    )
    args = parser.parse_args()
    allowed = parse_languages(args.languages)

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
        print("Model loaded, detecting language...", file=sys.stderr, flush=True)
        language = pick_allowed_language(model, args.audio_path, allowed)
        print(f"Transcribing as {language}...", file=sys.stderr, flush=True)
        segments, _info = model.transcribe(args.audio_path, language=language)
        text = " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    duration_ms = int((time.time() - start) * 1000)
    payload = {
        "text": text,
        "language": language,
        "duration_ms": duration_ms,
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
