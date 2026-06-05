#!/usr/bin/env python3
"""Pre-download faster-whisper model so voice notes don't timeout on first use."""

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Prefetch faster-whisper model")
    parser.add_argument("--model", default="small", help="Model size (default: small)")
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

    print(f"Downloading Whisper model '{args.model}' (~500MB on first run)...", flush=True)
    WhisperModel(args.model, device="cpu", compute_type="int8")
    print(f"Model '{args.model}' ready.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
