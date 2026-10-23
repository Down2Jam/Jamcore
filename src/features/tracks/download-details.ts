import { PageVersion } from "@prisma/client";
import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { NotFoundError } from "../../lib/errors.js";

const trackFields = {
  id: true, slug: true, name: true, url: true, sortOrder: true,
  origin: true, externalAuthorName: true, license: true,
  allowDownload: true, allowBackgroundUse: true, allowBackgroundUseAttribution: true,
  composer: { select: { id: true, name: true, slug: true } },
} as const;

export async function getTrackDownloadDetails(trackSlug: string, version: PageVersion, tenantId?: string | null) {
  const candidates = await db.gamePageTrack.findMany({
    where: { slug: trackSlug, gamePage: { version: { in: [PageVersion.JAM, PageVersion.POST_JAM] }, game: { published: true } } },
    select: { id: true, gamePage: { select: { gameId: true, version: true } } },
  });
  const allowed = await filterCoreEntityIdsByTenant({ entityType: "Game", ids: candidates.map(item => item.gamePage.gameId), tenantId });
  const visible = candidates.filter(item => allowed.includes(item.gamePage.gameId));
  const candidate = visible.find(item => item.gamePage.version === version) ??
    (version === PageVersion.POST_JAM ? visible.find(item => item.gamePage.version === PageVersion.JAM) : undefined);
  if (!candidate) throw new NotFoundError("Track not found");

  const game = await db.game.findUnique({
    where: { id: candidate.gamePage.gameId },
    select: {
      id: true, slug: true,
      pages: {
        where: { version: { in: [PageVersion.JAM, PageVersion.POST_JAM] } },
        select: {
          id: true, version: true, name: true, thumbnail: true, soundtrackThumbnail: true,
          tracks: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: trackFields },
        },
      },
    },
  });
  const page = game?.pages.find(item => item.version === version);
  const sourcePage = game?.pages.find(item => item.version === candidate.gamePage.version);
  const track = sourcePage?.tracks.find(item => item.id === candidate.id);
  if (!game || !page || !track) throw new NotFoundError("Track version not found");
  const artwork = { id: game.id, slug: game.slug, name: page.name, thumbnail: page.thumbnail, soundtrackThumbnail: page.soundtrackThumbnail };
  return {
    track: { ...track, pageVersion: version, game: artwork },
    game: { id: game.id, slug: game.slug, jamPage: game.pages.find(item => item.version === PageVersion.JAM) ?? null, postJamPage: game.pages.find(item => item.version === PageVersion.POST_JAM) ?? null },
  };
}
