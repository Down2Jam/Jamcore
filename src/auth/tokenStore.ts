import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import db from "../infra/db.js";
import { UnauthorizedError } from "../lib/errors.js";

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const isOpaqueToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const generateToken = () => randomBytes(32).toString("base64url");

export async function issuePair(tx: Prisma.TransactionClient, sessionId: string, expiresAt: Date, now = new Date()) {
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const accessExpiresAt = new Date(Math.min(now.getTime() + ACCESS_TOKEN_TTL_MS, expiresAt.getTime()));
  await tx.accessToken.create({ data: { hash: hashToken(accessToken), sessionId, expiresAt: accessExpiresAt } });
  await tx.refreshToken.create({ data: { hash: hashToken(refreshToken), sessionId, expiresAt } });
  return { accessToken, refreshToken, accessExpiresAt, expiresAt, sessionId };
}

export async function createSessionTokens(userId: number, tenantId?: string | null) {
  return db.$transaction(async tx => {
    const session = await tx.authSession.create({ data: {
      id: randomUUID(), userId, tenantId: tenantId ?? null, scopes: [],
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    } });
    return issuePair(tx, session.id, session.expiresAt);
  });
}

export async function resolveAccessToken(raw: string, tenantId?: string | null) {
  if (!isOpaqueToken(raw)) return null;
  const token = await db.accessToken.findUnique({
    where: { hash: hashToken(raw) },
    include: { session: { include: { app: true, user: { select: { id: true, slug: true } } } } },
  });
  const now = Date.now();
  if (!token || token.expiresAt.getTime() <= now || token.session.revokedAt || token.session.app?.disabledAt ||
      token.session.expiresAt.getTime() <= now || token.session.tenantId !== (tenantId ?? null)) return null;
  return { user: token.session.user, sessionId: token.sessionId, appId: token.session.appId, scopes: token.session.scopes };
}

export async function rotateSessionTokens(raw: string, tenantId?: string | null, appId: string | null = null) {
  if (!isOpaqueToken(raw)) throw new UnauthorizedError("Invalid refresh token.");
  const result = await db.$transaction(async tx => {
    const token = await tx.refreshToken.findUnique({ where: { hash: hashToken(raw) } });
    if (!token) return null;
    // Lock the family so concurrent refreshes cannot both succeed.
    await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id" = ${token.sessionId} FOR UPDATE`;
    const session = await tx.authSession.findUnique({ where: { id: token.sessionId }, include: { app: true } });
    const now = new Date();
    if (!session || session.revokedAt || session.app?.disabledAt || session.expiresAt <= now ||
        token.expiresAt <= now || session.tenantId !== (tenantId ?? null) || session.appId !== appId) return null;
    const consumed = await tx.refreshToken.updateMany({
      where: { hash: token.hash, consumedAt: null }, data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: now } });
      return null; // Commit revocation before throwing outside the transaction.
    }
    return { ...await issuePair(tx, session.id, session.expiresAt, now), scopes: session.scopes };
  });
  if (!result) throw new UnauthorizedError("Refresh token expired, revoked, or already used. Please sign in again.");
  return result;
}

export async function revokeSessionToken(raw: string, kind: "access" | "refresh", tenantId?: string | null) {
  if (!isOpaqueToken(raw)) return;
  const where = { hash: hashToken(raw) };
  const token = kind === "access" ? await db.accessToken.findUnique({ where }) : await db.refreshToken.findUnique({ where });
  if (!token) return;
  await db.authSession.updateMany({
    where: { id: token.sessionId, tenantId: tenantId ?? null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
