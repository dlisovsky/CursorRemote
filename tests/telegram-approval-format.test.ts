import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compactApprovalDescription } from '../src/server/transports/telegram/telegram-approval-format.js';

describe('compactApprovalDescription', () => {
  it('extracts command after shell wrapper', () => {
    const raw =
      '20045627 /bin/zsh -c snap=... -- pkill -f "tsx watch" 2>/dev/null; cd /repo && npm run dev';
    const out = compactApprovalDescription(raw);
    assert.match(out, /npm run dev/);
    assert.ok(!out.includes('dump_zsh_state'));
  });

  it('truncates long plain descriptions', () => {
    const out = compactApprovalDescription('x'.repeat(400));
    assert.ok(out.length <= 280);
  });
});
