import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PhotoAlbumCollector } from '../src/server/transports/telegram/photo-album-collector.js';

describe('PhotoAlbumCollector', () => {
  it('debounces album messages into one flush', async () => {
    const flushes: Array<{ fileIds: string[]; caption?: string }> = [];
    const collector = new PhotoAlbumCollector((flush) => {
      flushes.push({ fileIds: flush.item.fileIds, caption: flush.item.caption });
    });

    collector.add(1, 42, 'album-1', 'file-a', 'first');
    collector.add(1, 42, 'album-1', 'file-b', 'caption final');

    assert.equal(flushes.length, 0);
    await new Promise(r => setTimeout(r, 900));

    assert.equal(flushes.length, 1);
    assert.deepEqual(flushes[0].fileIds, ['file-a', 'file-b']);
    assert.equal(flushes[0].caption, 'caption final');
    collector.dispose();
  });
});
