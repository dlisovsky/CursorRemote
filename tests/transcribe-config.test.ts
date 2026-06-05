import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscribeLanguages } from '../src/server/config.js';

describe('parseTranscribeLanguages', () => {
  it('defaults to en and ru', () => {
    assert.deepEqual(parseTranscribeLanguages(undefined), ['en', 'ru']);
    assert.deepEqual(parseTranscribeLanguages(''), ['en', 'ru']);
  });

  it('parses comma-separated codes', () => {
    assert.deepEqual(parseTranscribeLanguages('en, ru'), ['en', 'ru']);
    assert.deepEqual(parseTranscribeLanguages('RU,EN'), ['ru', 'en']);
  });
});
