import { MOCK_INIT_DATA } from "../../shared/types.js";
import { getTelegramInitData, mockAuthEnabled } from "./telegramEnv.js";

const TOKEN_KEY = "cr_jwt";

/** Real Telegram initData when in Mini App; mock payload in Chrome when VITE_MOCK_TG=true. */
export function getInitData(): string {
  const real = getTelegramInitData();
  if (real) return real;
  if (mockAuthEnabled()) return MOCK_INIT_DATA;
  return "";
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function ensureAuth(): Promise<string> {
  const existing = getToken();
  if (existing) return existing;

  const res = await fetch("/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: getInitData() }),
  });
  if (!res.ok) throw new Error("Auth failed");
  const data = (await res.json()) as { token: string };
  setToken(data.token);
  return data.token;
}
