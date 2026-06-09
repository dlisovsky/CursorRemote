import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface IncomingAttachment {
  name: string;
  mime: string;
  data: string;
}

export interface SavedAttachment {
  id: string;
  name: string;
  mime: string;
  /** Path relative to agent cwd */
  relativePath: string;
  absolutePath: string;
}

const INBOX_DIR = ".cursor-remote/inbox";

export function saveAttachments(
  cwd: string,
  items: IncomingAttachment[],
  opts: { maxCount: number; maxBytes: number },
): SavedAttachment[] {
  if (items.length > opts.maxCount) {
    throw new Error(`Too many attachments (max ${opts.maxCount})`);
  }

  const inboxRoot = path.join(cwd, INBOX_DIR);
  fs.mkdirSync(inboxRoot, { recursive: true });

  const saved: SavedAttachment[] = [];
  for (const item of items) {
    const buf = Buffer.from(item.data, "base64");
    if (buf.length > opts.maxBytes) {
      throw new Error(`Attachment too large (max ${Math.round(opts.maxBytes / 1024 / 1024)}MB)`);
    }
    const safeName = path.basename(item.name || "image").replace(/[^\w.-]+/g, "_");
    const id = randomUUID();
    const fileName = `${id}-${safeName}`;
    const absolutePath = path.join(inboxRoot, fileName);
    fs.writeFileSync(absolutePath, buf);
    saved.push({
      id,
      name: safeName,
      mime: item.mime,
      relativePath: path.join(INBOX_DIR, fileName),
      absolutePath,
    });
  }
  return saved;
}

export function resolveAttachmentPath(cwd: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath);
  if (normalized.includes("..") || !normalized.startsWith(INBOX_DIR)) return null;
  const absolute = path.join(cwd, normalized);
  if (!fs.existsSync(absolute)) return null;
  return absolute;
}
