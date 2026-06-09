import type { SavedAttachment } from "./attachments.js";

/** Build SDK prompt text that references saved workspace image paths. */
export function buildPromptWithAttachments(text: string, images: SavedAttachment[]): string {
  const trimmed = text.trim();
  if (images.length === 0) return trimmed;

  const paths = images.map((i) => i.relativePath).join("\n- ");
  const intro = images.length === 1 ? "Attached image" : `Attached images (${images.length})`;
  const pathBlock = `${intro} saved in the workspace:\n- ${paths}`;

  if (!trimmed) {
    return `${pathBlock}\n\nPlease review the attached image(s) and help accordingly.`;
  }
  return `${trimmed}\n\n${pathBlock}`;
}
