import { Router, urlencoded } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import db from "../../../infra/db.js";
import { env } from "../../../config/env.js";
import authUser from "../../../middleware/authUser.js";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "../../../middleware/rateLimit.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { assertSessionOrigin } from "../../../auth/session.js";
import { rotateSessionTokens, revokeSessionToken } from "../../../auth/tokenStore.js";
import { APP_SCOPES } from "../../../auth/appScopes.js";
import { authorizeSchema, registerAppSchema, validateAuthorization, approveAuthorization, exchangeCodeSchema, exchangeCode } from "../../../auth/oauth.js";
import { ForbiddenError, UnauthorizedError, BadRequestError } from "../../../lib/errors.js";
import { requireRequestUser } from "../../../lib/locals.js";
const router = Router();
router.use((req, res, next) => {
  if (req.path === "/token" || req.path === "/revoke") res.locals.rawResponse = true;
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Pragma", "no-cache"); next();
});
router.use(rateLimit(30));
router.use(urlencoded({ extended: false, limit: "16kb" }));
const siteOnly = asyncHandler(async (req, res, next) => {
  assertSessionOrigin(req);
  if (res.locals.authMethod !== "session") throw new ForbiddenError("Use the website to manage app authorizations.");
  next();
});
router.get("/authorize", asyncHandler(async (req, res) => {
  await validateAuthorization(authorizeSchema.parse(req.query));
  const target = new URL("/authorize-app", env.clientOrigin);
  for (const [key, value] of Object.entries(req.query)) if (typeof value === "string") target.searchParams.set(key, value);
  res.redirect(target.toString());
}));
router.get("/request", asyncHandler(async (req, res) => {
  const request = authorizeSchema.parse(req.query);
  const app = await validateAuthorization(request);
  res.json({ name: app.name, redirectUri: request.redirect_uri, scopes: request.scope.map(id => ({ id, description: APP_SCOPES[id as keyof typeof APP_SCOPES] })) });
}));
router.post("/authorize", authUser, getUser, siteOnly, asyncHandler(async (req, res) => {
  const approved = z.boolean().parse(req.body.approved);
  res.json(await approveAuthorization(authorizeSchema.parse(req.body), requireRequestUser(res).id, res.locals.tenantId, approved));
}));
router.post("/token", asyncHandler(async (req, res) => {
  const input = req.body;
  const pair = input?.grant_type === "refresh_token"
    ? await (async () => {
      const parsed = z.object({ refresh_token: z.string().min(1).max(256), client_id: z.string().uuid() }).parse(input);
      return rotateSessionTokens(parsed.refresh_token, res.locals.tenantId, parsed.client_id);
    })()
    : await exchangeCode(exchangeCodeSchema.parse(input), res.locals.tenantId);
  res.json({ access_token: pair.accessToken, refresh_token: pair.refreshToken, token_type: "Bearer",
    expires_in: Math.max(0, Math.floor((pair.accessExpiresAt.getTime() - Date.now()) / 1000)), scope: pair.scopes.join(" ") });
}));
router.post("/revoke", asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().max(256) }).parse(req.body);
  await revokeSessionToken(token, "access", res.locals.tenantId);
  await revokeSessionToken(token, "refresh", res.locals.tenantId);
  res.status(200).json({ revoked: true });
}));
router.get("/apps", authUser, getUser, asyncHandler(async (_req, res) => {
  if (res.locals.authMethod !== "session") throw new ForbiddenError();
  res.json(await db.oAuthApp.findMany({ where: { ownerId: requireRequestUser(res).id }, orderBy: { createdAt: "desc" } }));
}));
router.post("/apps", authUser, getUser, siteOnly, asyncHandler(async (req, res) => {
  const input = registerAppSchema.parse(req.body);
  const ownerId = requireRequestUser(res).id;
  if (await db.oAuthApp.count({ where: { ownerId } }) >= 20) throw new ForbiddenError("App registration limit reached.");
  res.status(201).json(await db.oAuthApp.create({ data: { id: randomUUID(), ownerId, ...input } }));
}));
router.delete("/apps", authUser, getUser, siteOnly, asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.body.id);
  await db.oAuthApp.updateMany({ where: { id, ownerId: requireRequestUser(res).id }, data: { disabledAt: new Date() } });
  res.json({ disabled: true });
}));
router.get("/connections", authUser, getUser, asyncHandler(async (_req, res) => {
  if (res.locals.authMethod !== "session") throw new ForbiddenError();
  const connections = await db.authSession.findMany({
    where: { userId: requireRequestUser(res).id, tenantId: res.locals.tenantId ?? null, appId: { not: null }, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, scopes: true, createdAt: true, expiresAt: true, app: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(connections.map(connection => ({ ...connection,
    permissions: connection.scopes.map(scope => APP_SCOPES[scope as keyof typeof APP_SCOPES] ?? scope),
  })));
}));
router.delete("/connections", authUser, getUser, siteOnly, asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.body.id);
  await db.authSession.updateMany({ where: { id, userId: requireRequestUser(res).id, tenantId: res.locals.tenantId ?? null, appId: { not: null } }, data: { revokedAt: new Date() } });
  res.json({ revoked: true });
}));
router.use((error: unknown, req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (req.path !== "/token") return next(error);
  if (error instanceof z.ZodError || error instanceof BadRequestError) {
    res.status(400).json({ error: "invalid_request", error_description: "Invalid token request parameters." });
  } else if (error instanceof UnauthorizedError) {
    res.status(400).json({ error: "invalid_grant", error_description: error.message });
  } else next(error);
});
export default router;
