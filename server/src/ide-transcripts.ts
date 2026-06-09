import fs from "node:fs";
import path from "node:path";
import { getDefaultSdkStateRoot } from "@cursor/sdk";
import { loadComposerHeadersForWorkspace, type ComposerHeader } from "./composer-headers.js";
import type { IdeSessionInfo, IdeTranscriptLine } from "../../shared/types.js";

/** Cursor stores IDE chat logs under ~/.cursor/projects/<slug>/agent-transcripts/. */
export function getIdeTranscriptsDir(cwd: string): string | null {
  const storeRoot = getDefaultSdkStateRoot(cwd);
  const projectDir = path.dirname(path.dirname(storeRoot));
  const dir = path.join(projectDir, "agent-transcripts");
  return fs.existsSync(dir) ? dir : null;
}

function transcriptFilePath(transcriptsDir: string, sessionId: string): string {
  return path.join(transcriptsDir, sessionId, `${sessionId}.jsonl`);
}

function linkedCursorAgentId(sessionId: string): string | null {
  return sessionId.startsWith("agent-") ? sessionId : null;
}

/** Pull readable text from IDE user_message blobs. */
export function extractUserText(raw: string): string {
  const tagged = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (tagged?.[1]) return tagged[1].trim();

  if (raw.includes("agentConversationTurn")) {
    try {
      const parsed = JSON.parse(raw) as {
        agentConversationTurn?: { userMessage?: { text?: string } };
      };
      const t = parsed.agentConversationTurn?.userMessage?.text;
      if (typeof t === "string" && t.trim()) return t.trim();
    } catch {
      /* not JSON */
    }
  }

  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

type ContentBlock =
  | { type: "text"; text?: string }
  | { type: "tool_use"; name?: string; input?: Record<string, unknown> };

function toolSummary(name: string, input?: Record<string, unknown>): string {
  const pathVal = input?.path;
  if (typeof pathVal === "string") return `${name} ${path.basename(pathVal)}`;
  const cmd = input?.command;
  if (typeof cmd === "string") return `${name} ${cmd.slice(0, 60)}`;
  return name;
}

function parseTranscriptLines(raw: string): IdeTranscriptLine[] {
  const lines: IdeTranscriptLine[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (row.type === "turn_ended") continue;

    const role = row.role;
    if (role !== "user" && role !== "assistant") continue;

    const message = row.message as { content?: ContentBlock[] } | undefined;
    const blocks = message?.content ?? [];

    const textParts: string[] = [];
    const tools: { name: string; summary: string }[] = [];

    for (const block of blocks) {
      if (block.type === "text" && block.text?.trim()) {
        textParts.push(block.text.trim());
      }
      if (block.type === "tool_use" && block.name) {
        tools.push({
          name: block.name,
          summary: toolSummary(block.name, block.input),
        });
      }
    }

    const text =
      role === "user"
        ? extractUserText(textParts.join("\n"))
        : textParts.join("\n\n").replace(/\[REDACTED\]/g, "").trim();

    if (!text && tools.length === 0) continue;

    lines.push({
      role,
      text: text || (tools.length ? "" : ""),
      tools: tools.length ? tools : undefined,
    });
  }

  return lines;
}

function metaForSession(
  sessionId: string,
  headers: Map<string, ComposerHeader>,
  fileMtime: string,
): Pick<IdeSessionInfo, "title" | "subtitle" | "updatedAt"> {
  const header = headers.get(sessionId);
  if (header) {
    return {
      title: header.name,
      subtitle: header.subtitle,
      updatedAt: header.lastUpdatedAt,
    };
  }
  return {
    title: "Cursor IDE chat",
    subtitle: "",
    updatedAt: fileMtime,
  };
}

/** List IDE sessions without reading transcript bodies (titles from Cursor composer headers). */
export function listIdeSessions(
  cwd: string,
  registeredCursorAgentIds: Set<string> = new Set(),
): IdeSessionInfo[] {
  const dir = getIdeTranscriptsDir(cwd);
  if (!dir) return [];

  const headers = loadComposerHeadersForWorkspace(cwd);
  const sessions: IdeSessionInfo[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sessionId = entry.name;
    const filePath = transcriptFilePath(dir, sessionId);
    if (!fs.existsSync(filePath)) continue;

    const linked = linkedCursorAgentId(sessionId);
    if (linked && registeredCursorAgentIds.has(linked)) continue;

    const stat = fs.statSync(filePath);
    const fileMtime = stat.mtime.toISOString();
    const meta = metaForSession(sessionId, headers, fileMtime);

    sessions.push({
      id: sessionId,
      title: meta.title,
      subtitle: meta.subtitle,
      updatedAt: meta.updatedAt,
      linkedCursorAgentId: linked,
      source: "cursor_ide",
      canResume: Boolean(linked),
    });
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getIdeSessionMeta(
  cwd: string,
  sessionId: string,
): Pick<IdeSessionInfo, "title" | "subtitle" | "updatedAt" | "canResume" | "linkedCursorAgentId"> | null {
  const dir = getIdeTranscriptsDir(cwd);
  if (!dir) return null;

  const safeId = path.basename(sessionId);
  const filePath = transcriptFilePath(dir, safeId);
  if (!fs.existsSync(filePath)) return null;

  const headers = loadComposerHeadersForWorkspace(cwd);
  const stat = fs.statSync(filePath);
  const linked = linkedCursorAgentId(safeId);
  const meta = metaForSession(safeId, headers, stat.mtime.toISOString());

  return {
    ...meta,
    linkedCursorAgentId: linked,
    canResume: Boolean(linked),
  };
}

/** Load full transcript — call only when user opens a chat. */
export function loadIdeSession(cwd: string, sessionId: string): IdeTranscriptLine[] | null {
  const dir = getIdeTranscriptsDir(cwd);
  if (!dir) return null;

  const safeId = path.basename(sessionId);
  const filePath = transcriptFilePath(dir, safeId);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  return parseTranscriptLines(raw);
}
