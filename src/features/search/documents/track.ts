import { PageVersion } from "@prisma/client";

import db from "../../../infra/db.js";
import type { SearchDocumentRecord } from "../../../infra/searchStore.js";

export async function buildTrackSearchDocuments(input: {
  trackId: number;
  tenantId?: string | null;
}) {
  const track = await db.gamePageTrack.findUnique({
    where: { id: input.trackId },
    select: {
      id: true,
      slug: true,
      name: true,
      commentary: true,
      updatedAt: true,
      composer: {
        select: {
          name: true,
        },
      },
      tags: {
        select: {
          name: true,
        },
      },
      gamePage: {
        select: {
          version: true,
          name: true,
          game: {
            select: {
              id: true,
              published: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!track || !track.gamePage.game.published) {
    return [];
  }

  return [
    {
      documentId: `track:${track.id}:${track.gamePage.version}`,
      tenantId: input.tenantId ?? null,
      entityType: "track",
      entityId: track.id,
      variant: track.gamePage.version,
      title: track.name,
      subtitle: track.gamePage.name ?? track.composer?.name ?? null,
      body: [track.commentary, track.composer?.name, track.gamePage.game.slug].filter(Boolean).join(" "),
      slug: track.slug,
      tags: track.tags.map((tag) => tag.name),
      visibility: "public",
      metadata: {
        pageVersion: track.gamePage.version ?? PageVersion.JAM,
        gameId: track.gamePage.game.id,
      },
      sourceUpdatedAt: track.updatedAt.toISOString(),
      indexedAt: new Date().toISOString(),
    },
  ] satisfies SearchDocumentRecord[];
}
