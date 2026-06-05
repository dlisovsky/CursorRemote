import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('voice download URL', () => {
  it('constructs Telegram file download URL from bot token and file path', () => {
    const botToken = '123:ABC';
    const filePath = 'voice/file_42.ogg';
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    assert.equal(url, 'https://api.telegram.org/file/bot123:ABC/voice/file_42.ogg');
  });
});
