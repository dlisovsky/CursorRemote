import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface ComposerHeader {
  composerId: string;
  name: string;
  subtitle: string;
  lastUpdatedAt: string;
  createdAt: string;
}

interface RawComposerHead {
  composerId?: string;
  name?: string;
  subtitle?: string;
  lastUpdatedAt?: number;
  createdAt?: number;
  workspaceIdentifier?: {
    uri?: { fsPath?: string; path?: string };
  };
}

function globalStateDbPath(): string | null {
  const override = process.env.CURSOR_GLOBAL_STATE_DB?.trim();
  if (override && fs.existsSync(override)) return override;

  const home = os.homedir();
  const candidates =
    process.platform === "darwin"
      ? [path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")]
      : process.platform === "win32"
        ? [path.join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb")]
        : [path.join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb")];

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function workspaceMatches(cwd: string, head: RawComposerHead): boolean {
  const uri = head.workspaceIdentifier?.uri;
  const wsPath = uri?.fsPath ?? uri?.path;
  if (!wsPath) return false;
  return path.resolve(wsPath) === path.resolve(cwd);
}

function toIso(ms: number | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Cursor sidebar titles from globalStorage state.vscdb → composer.composerHeaders */
export function loadComposerHeadersForWorkspace(cwd: string): Map<string, ComposerHeader> {
  const dbPath = globalStateDbPath();
  const out = new Map<string, ComposerHeader>();
  if (!dbPath) return out;

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'")
      .get() as { value?: string | Buffer } | undefined;
    if (!row?.value) return out;

    const raw = typeof row.value === "string" ? row.value : row.value.toString("utf8");
    const parsed = JSON.parse(raw) as { allComposers?: RawComposerHead[] };
    for (const head of parsed.allComposers ?? []) {
      if (!head.composerId || !workspaceMatches(cwd, head)) continue;
      const lastUpdatedAt = toIso(head.lastUpdatedAt);
      const createdAt = toIso(head.createdAt);
      out.set(head.composerId, {
        composerId: head.composerId,
        name: head.name?.trim() || "Cursor IDE chat",
        subtitle: head.subtitle?.trim() ?? "",
        lastUpdatedAt: lastUpdatedAt ?? createdAt ?? new Date(0).toISOString(),
        createdAt: createdAt ?? lastUpdatedAt ?? new Date(0).toISOString(),
      });
    }
  } catch {
    return out;
  } finally {
    db?.close();
  }

  return out;
}
