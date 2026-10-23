import express from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireRequestUser } from "@lib/locals";
import db from "../../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../../infra/coreTenantStore.js";

const router = express.Router();
router.get("/", authUser, getUser, asyncHandler(async (_req, res) => {
  const user = requireRequestUser(res);
  const records = await db.musicListen.findMany({
    where: { userId: user.id, tenantKey: res.locals.tenantId ?? "", track: { gamePage: { game: { published: true } } } },
    orderBy: [{ playedAt: "desc" }, { eventId: "desc" }], take: 500,
    include: { track: { select: {
      id: true, slug: true, name: true, url: true, loudnessGainDb: true,
      allowDownload: true, license: true, allowBackgroundUse: true, allowBackgroundUseAttribution: true,
      externalAuthorName: true,
      composer: { select: { id: true, slug: true, name: true, profilePicture: true } },
      gamePage: { select: { version: true, soundtrackThumbnail: true, thumbnail: true, name: true,
        game: { select: { id: true, slug: true, jamId: true } } } },
    } } },
  });
  const allowed = new Set(await filterCoreEntityIdsByTenant({ entityType: "Game", ids: records.map(row => row.track.gamePage.game.id), tenantId: res.locals.tenantId }));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: records.filter(row => allowed.has(row.track.gamePage.game.id)).map(({ track, playedAt, eventId }) => {
    const { gamePage, ...details } = track;
    return { ...details, composer: track.composer ?? { name: track.externalAuthorName ?? "Unknown artist" },
      game: { ...gamePage.game, name: gamePage.name, thumbnail: gamePage.thumbnail, soundtrackThumbnail: gamePage.soundtrackThumbnail },
      pageVersion: gamePage.version, playedAt: playedAt.getTime(), eventId };
  }) });
}));
export default router;
