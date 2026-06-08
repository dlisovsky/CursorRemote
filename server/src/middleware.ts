import type { Request, Response, NextFunction } from "express";
import { extractBearer, verifyJwt, type AuthUser } from "./auth.js";

export type AuthedRequest = Request & { user?: AuthUser };

export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers.authorization);
  req.user = token ? (verifyJwt(token) ?? undefined) : undefined;
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ code: "auth_failed", message: "Unauthorized" });
    return;
  }
  next();
}
