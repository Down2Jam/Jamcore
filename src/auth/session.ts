import type { Request, Response } from "express";
import { resolveUserByGameAccessToken } from "./gameToken.js";
import { GAME_TOKEN_PREFIX } from "./gameTokenStore.js";
import { env } from "../config/env.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { resolveAccessToken, ACCESS_TOKEN_TTL_MS, SESSION_TTL_MS } from "./tokenStore.js";
import { assertAppScope } from "./appScopes.js";
export { createSessionTokens } from "./tokenStore.js";

export function getAuthorizationToken(req: Request) {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}
export function assertSessionOrigin(req: Request) {
  if (req.get("Origin") !== new URL(env.clientOrigin).origin) {
    throw new ForbiddenError("Session cookies can only be used by the website.");
  }
}
export function writeSession(res: Response, refreshToken: string, accessToken: string, expiresAt?: Date) {
  const options = { httpOnly: true, sameSite: "strict" as const, secure: env.nodeEnv === "production", path: "/" };
  res.cookie("refreshToken", refreshToken, {
    ...options, maxAge: expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : SESSION_TTL_MS,
  }).cookie("mediaAccessToken", accessToken, { ...options, maxAge: ACCESS_TOKEN_TTL_MS })
    .header("Authorization", accessToken).header("Cache-Control", "no-store");
}
export function clearSession(res: Response) {
  const options = { httpOnly: true, sameSite: "strict" as const, secure: env.nodeEnv === "production", path: "/" };
  res.clearCookie("refreshToken", options);
  res.clearCookie("mediaAccessToken", options);
  res.header("Cache-Control", "no-store");
}
export async function authenticateRequest(req: Request, res: Response, optional = false) {
  const raw = getAuthorizationToken(req);
  if (raw?.startsWith(GAME_TOKEN_PREFIX)) {
    const resolved = await resolveUserByGameAccessToken(raw);
    if (resolved) {
      if (res.locals.gameTokenAllowed !== true) {
        // Public routes can serve anonymous data without granting the token's user identity.
        if (optional) return null;
        throw new ForbiddenError("Game tokens are not allowed on this route.");
      }
      res.locals.authMethod = "gameToken";
      res.locals.gameAccessTokenId = resolved.tokenId;
      res.locals.gameAccessTokenGameId = resolved.gameId;
      return resolved.user.slug;
    }
  } else if (raw) {
    const resolved = await resolveAccessToken(raw, res.locals.tenantId);
    if (resolved) {
      if (resolved.appId) assertAppScope(req, resolved.scopes);
      res.locals.authMethod = resolved.appId ? "appToken" : "session";
      res.locals.authSessionId = resolved.sessionId;
      return resolved.user.slug;
    }
  }
  if (optional && (!raw || raw === "null" || raw === "undefined")) return null;
  throw new UnauthorizedError("Access token missing, expired, or revoked.");
}
