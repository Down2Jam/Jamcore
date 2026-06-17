import { PageVersion } from "@prisma/client";

import db from "../../../infra/db.js";
import type { SearchDocumentRecord } from "../../../infra/searchStore.js";

function tagsFromGamePage(page: {
  tags?: Array<{ name?: string | null }>;
}) {
  return (page.tags ?? [])
    .map((tag) => String(tag.name ?? "").trim())
    .filter(Boolean);
}

export async function buildGameSearchDocuments(input: {
  gameId: number;
  tenantId?: string | null;
}) {
  const game = await db.game.findUnique({
    where: { id: input.gameId },
    select: {
      id: true,
      slug: true,
      published: true,
      updatedAt: true,
      team: {
        select: {
          name: true,
          owner: {
            select: {
              name: true,
            },
          },
        },
      },
      pages: {
        where: {
          version: {
            in: [PageVersion.JAM, PageVersion.POST_JAM],
          },
        },
        select: {
          version: true,
          name: true,
          short: true,
          description: true,
          themeJustification: true,
          updatedAt: true,
          tags: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!game || !game.published) {
    return [];
  }

  return game.pages.map<SearchDocumentRecord>((page) => ({
    documentId: `game:${game.id}:${page.version}`,
    tenantId: input.tenantId ?? null,
    entityType: "game",
    entityId: game.id,
    variant: page.version,
    title: page.name ?? game.slug,
    subtitle: page.short ?? game.team?.name ?? null,
    body: [page.description, page.themeJustification, game.team?.owner?.name].filter(Boolean).join(" "),
    slug: game.slug,
    tags: tagsFromGamePage(page),
    visibility: "public",
    metadata: {
      pageVersion: page.version,
    },
    sourceUpdatedAt: (page.updatedAt ?? game.updatedAt).toISOString(),
    indexedAt: new Date().toISOString(),
  }));
}
