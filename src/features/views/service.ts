import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import db from "../../infra/db.js";
import { env } from "../../config/env.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import { ConfigurationError } from "../../lib/errors.js";

export function isHumanView(req: Request) {
  const agent = req.get("User-Agent") ?? "";
  const purpose = `${req.get("Purpose") ?? ""} ${req.get("Sec-Purpose") ?? ""} ${req.get("X-Moz") ?? ""}`;
  const site = req.get("Sec-Fetch-Site");
  return agent.length >= 8 && !/bot|crawl|spider|headless|preview|lighthouse|wget|curl|python|node\.js|prerender/i.test(agent)
    && !/prefetch|prerender/i.test(purpose) && (!site || site === "same-origin")
    && !!req.is("application/json");
}

export async function recordContentView(input: {
  kind: "game" | "track"; id: number; anonymousId: string; userId?: number; tenantId?: string;
}, now = new Date()) {
  const secret = env.tokenSecret;
  if (!secret) throw new ConfigurationError("There is no token secret.");
  const game = input.kind === "game"
    ? await db.game.findFirst({ where: { id: input.id, published: true }, select: { id: true } })
    : (await db.gamePageTrack.findFirst({ where: { id: input.id, gamePage: { game: { published: true } } }, select: { gamePage: { select: { gameId: true } } } }))?.gamePage;
  const gameId = game && ("gameId" in game ? game.gameId : game.id);
  if (!gameId || !await doesCoreEntityBelongToTenant({ entityType: "Game", entityId: gameId, tenantId: input.tenantId })) return;

  const tenantKey = input.tenantId ?? "";
  const targetKey = `${input.kind}:${input.id}`;
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  // Retain neither raw browser/account identifiers nor IP addresses in analytics.
  const hash = (identity: string) => createHmac("sha256", secret).update(JSON.stringify([tenantKey, day.toISOString(), identity])).digest("hex");
  const identities = [hash(`anon:${input.anonymousId}`), ...(input.userId ? [hash(`account:${input.userId}`)] : [])];
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.$transaction(async tx => {
        const existing = await tx.contentView.findMany({ where: { tenantKey, targetKey, day, identityHash: { in: identities } }, select: { identityHash: true } });
        const known = new Set(existing.map(row => row.identityHash));
        const missing = identities.filter(identity => !known.has(identity));
        if (!missing.length) return;
        // Linking both identities also prevents a guest view becoming a second view after login.
        const inserted = await tx.contentView.createMany({ data: missing.map((identityHash, index) => ({
          tenantKey, targetKey, day, identityHash, gameId, trackId: input.kind === "track" ? input.id : null,
          counted: existing.length === 0 && index === 0,
        })), skipDuplicates: true });
        if (!existing.length && !inserted.count) throw new Error("VIEW_RETRY");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (attempt < 4 && (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) || error instanceof Error && error.message === "VIEW_RETRY")) continue;
      throw error;
    }
  }
}
