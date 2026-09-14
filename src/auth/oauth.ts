import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import db from "../infra/db.js";
import { APP_SCOPES } from "./appScopes.js";
import { generateToken, hashToken, issuePair, SESSION_TTL_MS } from "./tokenStore.js";
import { BadRequestError, UnauthorizedError } from "../lib/errors.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { appConfig } from "../config/app.js";

const redirectUri = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return !url.hash && !url.username && !url.password &&
    (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)));
}, "Use an HTTPS redirect URI, or HTTP on localhost for development.");
export const registerAppSchema = z.object({ name: z.string().trim().min(1).max(100), redirectUris: z.array(redirectUri).min(1).max(10) });
const scopes = z.string().trim().min(1).max(1000).transform(value => [...new Set(value.split(/\s+/))])
  .refine(values => values.every(value => Object.hasOwn(APP_SCOPES, value)), "Unknown scope.");
export const authorizeSchema = z.object({
  response_type: z.literal("code"), client_id: z.string().uuid(), redirect_uri: redirectUri,
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal("S256"),
  scope: scopes, state: z.string().min(16).max(1024),
});
export type AuthorizationRequest = z.infer<typeof authorizeSchema>;
export async function validateAuthorization(input: AuthorizationRequest) {
  const app = await db.oAuthApp.findUnique({ where: { id: input.client_id } });
  if (!app || app.disabledAt || !app.redirectUris.includes(input.redirect_uri)) throw new BadRequestError("Invalid app or redirect URI.");
  return app;
}
export async function approveAuthorization(input: AuthorizationRequest, userId: number, tenantId: string | undefined, approved: boolean) {
  await validateAuthorization(input);
  const redirect = new URL(input.redirect_uri);
  redirect.searchParams.set("state", input.state);
  if (!approved) {
    redirect.searchParams.set("error", "access_denied");
  } else {
    const code = generateToken();
    await db.oAuthCode.create({ data: {
      hash: hashToken(code), appId: input.client_id, userId, tenantId: tenantId ?? null,
      redirectUri: input.redirect_uri, challenge: input.code_challenge, scopes: input.scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    } });
    redirect.searchParams.set("code", code);
  }
  return { redirectUri: redirect.toString() };
}
export const exchangeCodeSchema = z.object({
  grant_type: z.literal("authorization_code"), code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  client_id: z.string().uuid(), redirect_uri: redirectUri,
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});
export async function exchangeCode(input: z.infer<typeof exchangeCodeSchema>, tenantId?: string) {
  const code = await db.oAuthCode.findUnique({ where: { hash: hashToken(input.code) }, include: { app: true } });
  if (!code || code.app.disabledAt || code.appId !== input.client_id || code.redirectUri !== input.redirect_uri ||
      code.tenantId !== (tenantId ?? null) || code.expiresAt.getTime() <= Date.now()) throw new UnauthorizedError("Invalid authorization code.");
  const challenge = Buffer.from(hashToken(input.code_verifier), "hex").toString("base64url");
  if (!timingSafeEqual(Buffer.from(challenge), Buffer.from(code.challenge))) throw new UnauthorizedError("Invalid PKCE verifier.");
  const belongs = await doesCoreEntityBelongToTenant({ entityType: "User", entityId: code.userId, tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation });
  if (!belongs) throw new UnauthorizedError("Invalid authorization code.");
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "OAuthApp" WHERE "id" = ${code.appId} FOR UPDATE`;
    const app = await tx.oAuthApp.findUnique({ where: { id: code.appId } });
    if (!app || app.disabledAt) return null;
    const claimed = await tx.oAuthCode.updateMany({ where: { hash: code.hash, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) {
      const used = await tx.oAuthCode.findUnique({ where: { hash: code.hash } });
      if (used?.sessionId) await tx.authSession.updateMany({ where: { id: used.sessionId }, data: { revokedAt: new Date() } });
      return null;
    }
    const session = await tx.authSession.create({ data: {
      id: randomUUID(), userId: code.userId, tenantId: code.tenantId, appId: code.appId,
      scopes: code.scopes, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    } });
    await tx.oAuthCode.update({ where: { hash: code.hash }, data: { sessionId: session.id } });
    return { ...await issuePair(tx, session.id, session.expiresAt), scopes: code.scopes };
  });
  if (!result) throw new UnauthorizedError("Authorization code already used or app disabled.");
  return result;
}
