import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSER_ATTACHMENT_SCORE_JS } from '../src/server/command-executor.js';

describe('composer attachment score', () => {
  it('exports a self-contained evaluate snippet', () => {
    assert.match(COMPOSER_ATTACHMENT_SCORE_JS, /\.composer-bar/);
    assert.match(COMPOSER_ATTACHMENT_SCORE_JS, /auxiliarybar/);
    assert.match(COMPOSER_ATTACHMENT_SCORE_JS, /canvas/);
  });
});
