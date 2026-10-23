import express from "express";
import { z } from "zod";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";
import { NotFoundError } from "../../../lib/errors.js";
import db from "../../../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../../../infra/coreTenantStore.js";

const router = express.Router();
const schema = z.object({ eventId: z.string().uuid(), trackId: z.number().int().positive(), playedAt: z.number().int().positive().refine(value => value <= Date.now() + 60_000) });
router.post("/", authUser, getUser, asyncHandler(async (req, res) => {
  const user = requireRequestUser(res);
  const input = parseBody(req, schema);
  const track = await db.gamePageTrack.findUnique({ where: { id: input.trackId }, select: { gamePage: { select: { gameId: true, game: { select: { published: true } } } } } });
  if (!track?.gamePage.game.published || !await doesCoreEntityBelongToTenant({ entityType: "Game", entityId: track.gamePage.gameId, tenantId: res.locals.tenantId })) throw new NotFoundError("Track unavailable.");
  const tenantKey = res.locals.tenantId ?? "";
  await db.$transaction(async tx => {
    await tx.musicListen.upsert({ where: { userId_tenantKey_eventId: { userId: user.id, tenantKey, eventId: input.eventId } },
      create: { ...input, playedAt: new Date(input.playedAt), userId: user.id, tenantKey }, update: {} });
    const older = await tx.musicListen.findMany({ where: { userId: user.id, tenantKey }, orderBy: [{ playedAt: "desc" }, { eventId: "desc" }], skip: 500, select: { eventId: true } });
    if (older.length) await tx.musicListen.deleteMany({ where: { userId: user.id, tenantKey, eventId: { in: older.map(row => row.eventId) } } });
  });
  res.json({ message: "Listening history saved" });
}));
export default router;
