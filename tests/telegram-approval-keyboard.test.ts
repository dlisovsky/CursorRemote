import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendApprovalKeyboard,
  formatApprovals,
  pickApprovalActions,
} from '../src/server/transports/telegram/formatter.js';
import { tgKeyboard } from '../src/server/transports/telegram/tg-types.js';

describe('approval keyboard layout', () => {
  it('pickApprovalActions keeps at most run, allowlist, skip', () => {
    const picked = pickApprovalActions([
      { label: 'Run', type: 'approve', selectorPath: 'a' },
      { label: 'Allowlist x', type: 'approve', selectorPath: 'b' },
      { label: 'Skip', type: 'reject', selectorPath: 'c' },
      { label: 'Run 2', type: 'approve', selectorPath: 'd' },
    ]);
    assert.equal(picked.length, 3);
  });

  it('puts Run and Skip on first row, Allowlist on second', () => {
    const kb = tgKeyboard();
    appendApprovalKeyboard(kb, 'tool:abc', [
      { label: 'Run', type: 'approve', selectorPath: 'sp-run' },
      { label: 'Allowlist domain', type: 'approve', selectorPath: 'sp-allow' },
      { label: 'Skip', type: 'reject', selectorPath: 'sp-skip' },
    ], () => 'hash1');
    const { inline_keyboard } = kb.build();
    assert.equal(inline_keyboard.length, 2);
    assert.equal(inline_keyboard[0].length, 2);
    assert.equal(inline_keyboard[1].length, 1);
    assert.match(inline_keyboard[1][0].text, /Allowlist/);
  });

  it('formatApprovals uses compact shell summary', () => {
    const { html } = formatApprovals([{
      id: 'tool:1',
      description: 'pkill -f foo; cd /x && npm run dev',
      actions: [{ label: 'Run', type: 'approve', selectorPath: 'sp' }],
    }], () => 'h1');
    assert.match(html, /npm run dev/);
    assert.ok(!html.includes('pkill'));
  });
});
