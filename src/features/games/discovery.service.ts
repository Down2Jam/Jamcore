import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { gamePageInclude, materializeGamePage } from "./page.helpers.js";

export async function getRandomPublishedGame(tenantId?: string | null) {
  const game = await db.$queryRaw<{ id: number; name: string }[]>`
    WITH active_jams AS (
      SELECT j.id
      FROM "Jam" j
      WHERE NOW() >= j."startTime"
        AND NOW() < j."startTime"
          + (COALESCE(j."jammingHours", 0)
             + COALESCE(j."submissionHours", 0)
             + COALESCE(j."ratingHours", 0)) * INTERVAL '1 hour'
    )
    SELECT g.*
    FROM "Game" g
    WHERE g."published" = TRUE
      AND (
        NOT EXISTS (SELECT 1 FROM active_jams)
        OR g."jamId" IN (SELECT id FROM active_jams)
      )
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (!game[0]) {
    return null;
  }

  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [game[0].id],
    tenantId,
  });

  return allowedIds.includes(game[0].id) ? game[0] : null;
}

export async function listCurrentUserGames({
  userId,
  jamId,
}: {
  userId: number;
  jamId: number;
}) {
  const games = await db.game.findMany({
    where: {
      team: {
        users: {
          some: {
            id: userId,
          },
        },
      },
      jamId,
    },
    include: {
      pages: {
        where: {
          version: {
            in: ["JAM", "POST_JAM"],
          },
        },
        include: gamePageInclude,
      },
    },
  });

  return games.map((game) => ({
    ...materializeGamePage(game),
    jamPage: game.pages.find((page) => page.version === "JAM") ?? null,
    postJamPage: game.pages.find((page) => page.version === "POST_JAM") ?? null,
  }));
}
