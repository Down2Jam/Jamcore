import { PageVersion } from "@prisma/client";
import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { ForbiddenError } from "../../lib/errors.js";
import { getCurrentActiveJam } from "../jams/index.js";
import type { GameViewer } from "../../types/game.js";
import { canInspectUnpublishedGames } from "./inspection.policy.js";

export async function listCurrentJamGames(viewer: GameViewer, tenantId?: string | null) {
  if (!canInspectUnpublishedGames(viewer)) throw new ForbiddenError("Not allowed.");
  const active = await getCurrentActiveJam(tenantId);
  if (!active?.jam) return { jam: null, games: [] };
  const jam = await db.jam.findUnique({ where: { id: active.jam.id }, select: { id: true, name: true, slug: true } });
  const games = await db.game.findMany({
    where: { jamId: active.jam.id },
    orderBy: [{ published: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true, slug: true, category: true, published: true, publishedAt: true, createdAt: true, updatedAt: true,
      team: { select: { name: true, users: { select: { id: true, name: true, slug: true } } } },
      pages: { select: {
        version: true, name: true, description: true, thumbnail: true, playableBuildUrl: true, itchEmbedUrl: true,
        _count: { select: { downloadLinks: true, tracks: true } },
      } },
    },
  });
  const allowed = new Set(await filterCoreEntityIdsByTenant({
    entityType: "Game", ids: games.map((game) => game.id), tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  }));
  return {
    jam,
    games: games.filter((game) => allowed.has(game.id)).map(({ pages, ...game }) => {
      const page = pages.find((page) => page.version === PageVersion.JAM);
      return { ...game, name: page?.name || game.slug,
        hasDescription: Boolean(page?.description?.trim()), hasThumbnail: Boolean(page?.thumbnail),
        hasBuild: Boolean(page?.playableBuildUrl || page?.itchEmbedUrl || page?._count.downloadLinks),
        trackCount: page?._count.tracks ?? 0,
        hasPostJamPage: pages.some((page) => page.version === PageVersion.POST_JAM),
      };
    }),
  };
}
