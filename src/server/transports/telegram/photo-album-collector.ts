export interface PhotoAlbumItem {
  fileIds: string[];
  caption?: string;
}

export interface PhotoAlbumFlush {
  threadId: number;
  chatId: number;
  item: PhotoAlbumItem;
}

type FlushHandler = (flush: PhotoAlbumFlush) => void | Promise<void>;

interface PendingAlbum {
  fileIds: string[];
  caption?: string;
  timer: ReturnType<typeof setTimeout>;
}

const ALBUM_DEBOUNCE_MS = 800;

/**
 * Batches Telegram `media_group_id` photo messages into one flush per album.
 */
export class PhotoAlbumCollector {
  private pending = new Map<string, PendingAlbum>();

  constructor(private readonly onFlush: FlushHandler) {}

  private key(chatId: number, threadId: number, mediaGroupId: string): string {
    return `${chatId}:${threadId}:${mediaGroupId}`;
  }

  add(
    chatId: number,
    threadId: number,
    mediaGroupId: string,
    fileId: string,
    caption?: string
  ): void {
    const k = this.key(chatId, threadId, mediaGroupId);
    const existing = this.pending.get(k);
    if (existing) {
      clearTimeout(existing.timer);
      existing.fileIds.push(fileId);
      if (caption?.trim()) existing.caption = caption.trim();
    } else {
      this.pending.set(k, {
        fileIds: [fileId],
        caption: caption?.trim() || undefined,
        timer: setTimeout(() => this.flushKey(k), ALBUM_DEBOUNCE_MS),
      });
      return;
    }
    const entry = this.pending.get(k)!;
    entry.timer = setTimeout(() => this.flushKey(k), ALBUM_DEBOUNCE_MS);
  }

  private flushKey(k: string): void {
    const entry = this.pending.get(k);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(k);

    const sep = k.indexOf(':');
    const sep2 = k.indexOf(':', sep + 1);
    const chatId = parseInt(k.slice(0, sep), 10);
    const threadId = parseInt(k.slice(sep + 1, sep2), 10);

    void this.onFlush({
      chatId,
      threadId,
      item: { fileIds: [...entry.fileIds], caption: entry.caption },
    });
  }

  dispose(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
  }
}
