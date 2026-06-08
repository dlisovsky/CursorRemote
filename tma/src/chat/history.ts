import type { WireMessage } from "../../../shared/types.js";
import type { ChatItem } from "./types.js";
import { toolDetail } from "./types.js";

/** Rebuild chat items from persisted wire events (no live streaming state). */
export function chatItemsFromHistory(
  events: WireMessage[],
  attachmentUrlFn?: (fileId: string) => string,
): ChatItem[] {
  const items: ChatItem[] = [];
  let toolSeq = 0;

  for (const event of events) {
    if (event.type === "user_message") {
      items.push({
        kind: "user",
        id: `h-u-${event.runId}`,
        text: event.text,
        queued: event.queued,
        images: event.images?.map((img) => ({
          id: img.id,
          name: img.name,
          url: attachmentUrlFn ? attachmentUrlFn(img.id) : "",
        })),
      });
      continue;
    }

    if (event.type === "tool_call") {
      const detail = toolDetail(event.args);
      if (event.status === "running") {
        toolSeq += 1;
        items.push({
          kind: "tool",
          id: `h-tool-${event.runId}-${toolSeq}`,
          runId: event.runId,
          name: event.name,
          status: "running",
          detail,
        });
      } else {
        const idx = [...items]
          .reverse()
          .findIndex(
            (x) =>
              x.kind === "tool" &&
              x.runId === event.runId &&
              x.name === event.name &&
              x.status === "running",
          );
        if (idx >= 0) {
          const realIdx = items.length - 1 - idx;
          const row = items[realIdx]!;
          if (row.kind === "tool") {
            items[realIdx] = { ...row, status: event.status, detail: detail ?? row.detail };
          }
        } else {
          items.push({
            kind: "tool",
            id: `h-tool-${event.runId}-done`,
            runId: event.runId,
            name: event.name,
            status: event.status,
            detail,
          });
        }
      }
      continue;
    }

    if (event.type === "thinking" && event.duration != null) {
      items.push({
        kind: "thinking",
        id: `h-think-${event.runId}-${event.duration}`,
        label: `Thought for ${(event.duration / 1000).toFixed(1)}s`,
      });
      continue;
    }

    if (event.type === "assistant_complete") {
      const prev = items[items.length - 1];
      if (prev?.kind === "assistant" && prev.id === event.runId) continue;
      items.push({ kind: "assistant", id: event.runId, text: event.text });
    }
  }

  return items;
}
