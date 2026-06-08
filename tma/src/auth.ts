import { MOCK_INIT_DATA } from "../../shared/types.js";

const TOKEN_KEY = "cr_jwt";

export function getInitData(): string {
  if (import.meta.env.VITE_MOCK_TG === "true") return MOCK_INIT_DATA;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  return tg?.initData ?? MOCK_INIT_DATA;
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
