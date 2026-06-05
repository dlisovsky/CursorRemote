import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveTranscribeScript } from '../src/server/transports/telegram/voice-transcribe.js';

describe('resolveTranscribeScript', () => {
  it('prefers TRANSCRIBE_SCRIPT when set and exists', () => {
    const tmp = join(process.cwd(), 'temp', 'custom-transcribe.py');
    mkdirSync(join(process.cwd(), 'temp'), { recursive: true });
    writeFileSync(tmp, '# test');
    const path = resolveTranscribeScript({
      pythonPath: 'python3',
      model: 'small',
      languages: ['en', 'ru'],
      timeoutMs: 600_000,
      scriptPath: tmp,
    });
    assert.equal(path, tmp);
  });

  it('falls back to bundled or dev transcribe script', () => {
    const path = resolveTranscribeScript({
      pythonPath: 'python3',
      model: 'small',
      languages: ['en', 'ru'],
      timeoutMs: 600_000,
    });
    const expected = [
      resolve(process.cwd(), 'dist/transcribe/transcribe-voice.py'),
      resolve(process.cwd(), 'scripts/transcribe-voice.py'),
    ];
    assert.ok(path && expected.includes(path));
  });

  it('returns null when no script exists', () => {
    const path = resolveTranscribeScript({
      pythonPath: 'python3',
      model: 'small',
      languages: ['en', 'ru'],
      timeoutMs: 600_000,
      scriptPath: '/nonexistent/transcribe-voice.py',
    });
    assert.notEqual(path, '/nonexistent/transcribe-voice.py');
  });
});
