/**
 * Spawns tsx watch for development. License check is not performed.
 * Restarts automatically when server TS, .env, selectors.json, or transcribe script change.
 */
import { spawn } from 'child_process';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function syncTranscribeScript(): void {
  const src = resolve(process.cwd(), 'scripts/transcribe-voice.py');
  const destDir = resolve(process.cwd(), 'dist/transcribe');
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, resolve(destDir, 'transcribe-voice.py'));
}

async function main(): Promise<void> {
  syncTranscribeScript();

  const tsxPath = resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
  console.log('[dev] Hot reload enabled:');
  console.log('  • src/server/** — server restarts on save');
  console.log('  • .env, selectors.json, scripts/transcribe-voice.py — restart on change');
  console.log('  • Extension UI: run `npm run watch:ext` in another terminal');
  console.log('');

  const child = spawn(
    tsxPath,
    [
      'watch',
      '--exclude', './data/**',
      '--exclude', './temp/**',
      '--include', './.env',
      '--include', './selectors.json',
      '--include', './scripts/transcribe-voice.py',
      'src/server/index.ts',
    ],
    { stdio: 'inherit', cwd: process.cwd() }
  );

  child.on('error', (err) => {
    console.error('[dev] Failed to start:', err.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((err) => {
  console.error('[dev] Fatal:', err);
  process.exit(1);
});
