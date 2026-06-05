/**
 * Spawns tsx watch for development. License check is not performed.
 */
import { spawn } from 'child_process';
import { resolve } from 'path';

async function main(): Promise<void> {
  const tsxPath = resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
  const child = spawn(tsxPath, ['watch', '--exclude', './data/**', '--exclude', './temp/**', 'src/server/index.ts'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  child.on('error', (err) => {
    console.error('[dev-wrapper] Failed to start:', err.message);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((err) => {
  console.error('[dev-wrapper] Fatal:', err);
  process.exit(1);
});
