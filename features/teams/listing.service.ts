import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { gamePageInclude, materializeGamePage } from "../games/page.helpers.js";

export async function listTeams({
  cursor,
  limit = 20,
  targetUserId,
  tenantId,
}: {
  cursor?: string;
  limit?: number;
  targetUserId?: number;
  tenantId?: string | null;
}) {
  const normalizedLimit = Math.min(Math.max(limit, 1), 50);
  const cursorId = cursor && /^\d+$/.test(cursor) ? Number.parseInt(cursor, 10) : undefined;

  const teams = targetUserId
    ? await db.team.findMany({
        where: {
          users: {
            some: {
              id: targetUserId,
            },
          },
        },
        include: {
          users: {
            include: {
              primaryRoles: true,
              secondaryRoles: true,
            },
          },
          game: {
            include: {
              jam: true,
              pages: {
                where: {
                  version: {
                    in: ["JAM", "POST_JAM"],
                  },
                },
                include: gamePageInclude,
              },
            },
          },
          owner: true,
          rolesWanted: true,
          invites: {
            include: {
              user: true,
            },
          },
          applications: {
            include: {
              user: true,
            },
          },
        },
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        take: normalizedLimit + 1,
      })
    : await db.team.findMany({
        include: {
          users: true,
          owner: true,
          rolesWanted: true,
          game: {
            include: {
              jam: true,
              pages: {
                where: {
                  version: {
                    in: ["JAM", "POST_JAM"],
                  },
                },
                include: gamePageInclude,
              },
            },
          },
        },
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        take: normalizedLimit + 1,
      });

  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Team",
    ids: teams.map((team) => team.id),
    tenantId,
  });
  const tenantTeams = teams.filter((team) => allowedIds.includes(team.id));

  const items = tenantTeams.slice(0, normalizedLimit).map((team) => ({
    ...team,
    game: team.game
      ? {
          ...materializeGamePage(team.game),
          jamPage: team.game.pages.find((page) => page.version === "JAM") ?? null,
          postJamPage:
            team.game.pages.find((page) => page.version === "POST_JAM") ?? null,
        }
      : null,
  }));

  return {
    items,
    pageInfo: {
      hasMore: tenantTeams.length > normalizedLimit,
      nextCursor:
        tenantTeams.length > normalizedLimit && items.length > 0
          ? String(items[items.length - 1].id)
          : null,
      limit: normalizedLimit,
    },
  };
}
