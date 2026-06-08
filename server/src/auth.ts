import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { MOCK_INIT_DATA, MOCK_TG_USER_ID } from "../../shared/types.js";
import { config } from "./config.js";

export interface AuthUser {
  telegramUserId: number;
}

export function validateInitData(initData: string): AuthUser | null {
  if (config.mockTelegram) {
    const params = new URLSearchParams(initData);
    if (params.get("hash") === "mock") {
      const userRaw = params.get("user");
      if (!userRaw) return null;
      const user = JSON.parse(userRaw) as { id: number };
      if (user.id === MOCK_TG_USER_ID) return { telegramUserId: MOCK_TG_USER_ID };
    }
    if (initData === MOCK_INIT_DATA) return { telegramUserId: MOCK_TG_USER_ID };
  }

  const token = config.telegramBotToken();
  if (!token) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (computed !== hash) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  const user = JSON.parse(userRaw) as { id: number };
  return { telegramUserId: user.id };
}

export function issueJwt(user: AuthUser): string {
  return jwt.sign({ sub: String(user.telegramUserId) }, config.jwtSecret, {
    expiresIn: config.jwtTtlSeconds,
  });
}

export function verifyJwt(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    return { telegramUserId: Number(payload.sub) };
  } catch {
    return null;
  }
}

export function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}
