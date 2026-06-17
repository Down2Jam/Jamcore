import { PageVersion } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";

type RankedId = { id: number };

type SearchInput = {
  query: string;
  terms: string[];
  tenantId?: string | null;
  fuzzyThreshold: number;
};

async function runRankedSearch(
  sql: string,
  query: string,
  limit: number,
  fuzzyThreshold: number,
): Promise<number[] | null> {
  if (typeof db.$queryRawUnsafe !== "function") {
    return null;
  }

  try {
    const rows = (await db.$queryRawUnsafe(
      sql,
      query,
      limit,
      fuzzyThreshold,
    )) as RankedId[];
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

function orderByIds<TItem extends { id: number }>(items: TItem[], ids: number[]) {
  const rankById = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) =>
      (rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function normalizeSearchTerms(query: string, terms: string[]) {
  return [...new Set([query, ...terms].map((value) => value.trim()).filter(Boolean))].slice(
    0,
    8,
  );
}

function containsClauses(field: string, terms: string[]) {
  return terms.map((term) => ({
    [field]: {
      contains: term,
      mode: "insensitive" as const,
    },
  }));
}

async function filterIdsForTenant(entityType: "User" | "Post" | "Team" | "Game", ids: number[], tenantId?: string | null) {
  return filterCoreEntityIdsByTenant({
    entityType,
    ids,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
}

export async function searchGames(input: SearchInput) {
  const terms = normalizeSearchTerms(input.query, input.terms);
  const rankedIds =
    (await runRankedSearch(
      `
        SELECT g.id
        FROM "Game" g
        JOIN "GamePage" gp ON gp."gameId" = g.id
        WHERE g."published" = true
          AND (
            to_tsvector('simple', concat_ws(' ', coalesce(gp."name", ''), coalesce(gp."short", ''))) @@ websearch_to_tsquery('simple', $1)
            OR similarity(coalesce(gp."name", ''), $1) > $3
          )
        GROUP BY g.id
        ORDER BY MAX(
          ts_rank(
            to_tsvector('simple', concat_ws(' ', coalesce(gp."name", ''), coalesce(gp."short", ''))),
            websearch_to_tsquery('simple', $1)
          ) + similarity(coalesce(gp."name", ''), $1)
        ) DESC,
        MAX(g.id) DESC
        LIMIT $2
      `,
      input.query,
      12,
      input.fuzzyThreshold,
    )) ?? null;

  const tenantFilteredIds = rankedIds?.length
    ? await filterIdsForTenant("Game", rankedIds, input.tenantId)
    : null;

  const games = await db.game.findMany({
    where: tenantFilteredIds?.length
      ? { id: { in: tenantFilteredIds }, published: true }
      : {
          published: true,
          pages: {
            some: {
              OR: [
                ...containsClauses("name", terms),
                ...containsClauses("short", terms),
              ],
            },
          },
        },
    include: {
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
          thumbnail: true,
        },
      },
    },
    take: 12,
  });

  const allowedIds = await filterIdsForTenant(
    "Game",
    games.map((game) => game.id),
    input.tenantId,
  );
  const filteredGames = games.filter((game) => allowedIds.includes(game.id));

  return tenantFilteredIds?.length ? orderByIds(filteredGames, tenantFilteredIds) : filteredGames;
}

export async function searchUsers(input: SearchInput) {
  const terms = normalizeSearchTerms(input.query, input.terms);
  const rankedIds =
    (await runRankedSearch(
      `
        SELECT id
        FROM "User"
        WHERE
          to_tsvector('simple', concat_ws(' ', coalesce("name", ''), coalesce("slug", ''))) @@ websearch_to_tsquery('simple', $1)
          OR similarity(coalesce("name", ''), $1) > $3
          OR similarity(coalesce("slug", ''), $1) > $3
        ORDER BY
          ts_rank(
            to_tsvector('simple', concat_ws(' ', coalesce("name", ''), coalesce("slug", ''))),
            websearch_to_tsquery('simple', $1)
          ) DESC,
          GREATEST(similarity(coalesce("name", ''), $1), similarity(coalesce("slug", ''), $1)) DESC,
          id DESC
        LIMIT $2
      `,
      input.query,
      12,
      input.fuzzyThreshold,
    )) ?? null;

  const tenantFilteredIds = rankedIds?.length
    ? await filterIdsForTenant("User", rankedIds, input.tenantId)
    : null;

  const users = await db.user.findMany({
    where: tenantFilteredIds?.length
      ? { id: { in: tenantFilteredIds } }
      : {
          OR: [
            ...containsClauses("name", terms),
            ...containsClauses("slug", terms),
          ],
        },
    select: {
      id: true,
      name: true,
      slug: true,
      bannerPicture: true,
      profilePicture: true,
      short: true,
    },
    take: 12,
  });

  const allowedIds = await filterIdsForTenant(
    "User",
    users.map((user) => user.id),
    input.tenantId,
  );
  const filteredUsers = users.filter((user) => allowedIds.includes(user.id));

  return tenantFilteredIds?.length ? orderByIds(filteredUsers, tenantFilteredIds) : filteredUsers;
}

export async function searchPosts(input: SearchInput) {
  const terms = normalizeSearchTerms(input.query, input.terms);
  const rankedIds =
    (await runRankedSearch(
      `
        SELECT id
        FROM "Post"
        WHERE
          "deletedAt" IS NULL
          AND "removedAt" IS NULL
          AND (
            to_tsvector('simple', concat_ws(' ', coalesce("title", ''), coalesce("content", ''))) @@ websearch_to_tsquery('simple', $1)
            OR similarity(coalesce("title", ''), $1) > $3
          )
        ORDER BY
          ts_rank(
            to_tsvector('simple', concat_ws(' ', coalesce("title", ''), coalesce("content", ''))),
            websearch_to_tsquery('simple', $1)
          ) DESC,
          similarity(coalesce("title", ''), $1) DESC,
          id DESC
        LIMIT $2
      `,
      input.query,
      12,
      input.fuzzyThreshold,
    )) ?? null;

  const tenantFilteredIds = rankedIds?.length
    ? await filterIdsForTenant("Post", rankedIds, input.tenantId)
    : null;

  const posts = await db.post.findMany({
    where: tenantFilteredIds?.length
      ? { id: { in: tenantFilteredIds } }
      : {
          deletedAt: null,
          removedAt: null,
          OR: [
            ...containsClauses("title", terms),
            ...containsClauses("content", terms),
          ],
        },
    select: {
      id: true,
      title: true,
      slug: true,
    },
    take: 12,
  });

  const allowedIds = await filterIdsForTenant(
    "Post",
    posts.map((post) => post.id),
    input.tenantId,
  );
  const filteredPosts = posts.filter((post) => allowedIds.includes(post.id));

  return tenantFilteredIds?.length ? orderByIds(filteredPosts, tenantFilteredIds) : filteredPosts;
}

export async function searchTracks(input: SearchInput) {
  const terms = normalizeSearchTerms(input.query, input.terms);
  const rankedIds =
    (await runRankedSearch(
      `
        SELECT t.id
        FROM "GamePageTrack" t
        JOIN "GamePage" gp ON gp.id = t."gamePageId"
        JOIN "Game" g ON g.id = gp."gameId"
        WHERE g."published" = true
          AND gp."version" IN ('JAM', 'POST_JAM')
          AND (
            to_tsvector('simple', concat_ws(' ', coalesce(t."name", ''), coalesce(t."commentary", ''))) @@ websearch_to_tsquery('simple', $1)
            OR similarity(coalesce(t."name", ''), $1) > $3
          )
        ORDER BY
          ts_rank(
            to_tsvector('simple', concat_ws(' ', coalesce(t."name", ''), coalesce(t."commentary", ''))),
            websearch_to_tsquery('simple', $1)
          ) DESC,
          similarity(coalesce(t."name", ''), $1) DESC,
          t.id DESC
        LIMIT $2
      `,
      input.query,
      12,
      input.fuzzyThreshold,
    )) ?? null;

  const tracks = await db.gamePageTrack.findMany({
    where: rankedIds?.length
      ? { id: { in: rankedIds } }
      : {
          OR: [
            ...containsClauses("name", terms),
            ...containsClauses("commentary", terms),
          ],
          gamePage: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
            game: {
              published: true,
            },
          },
        },
    include: {
      composer: {
        select: {
          id: true,
          name: true,
          slug: true,
          profilePicture: true,
          bannerPicture: true,
        },
      },
      gamePage: {
        select: {
          version: true,
          gameId: true,
          name: true,
          short: true,
          thumbnail: true,
          game: {
            select: {
              id: true,
              slug: true,
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
                  thumbnail: true,
                },
              },
            },
          },
        },
      },
      tags: {
        include: {
          category: true,
        },
      },
      flags: true,
      links: true,
      credits: {
        include: {
          user: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 12,
  });

  const allowedGameIds = await filterIdsForTenant(
    "Game",
    tracks.map((track) => track.gamePage.game.id),
    input.tenantId,
  );
  const filteredTracks = tracks.filter((track) =>
    allowedGameIds.includes(track.gamePage.game.id),
  );

  return rankedIds?.length ? orderByIds(filteredTracks, rankedIds) : filteredTracks;
}

export async function searchTeams(input: SearchInput) {
  const terms = normalizeSearchTerms(input.query, input.terms);
  const rankedIds =
    (await runRankedSearch(
      `
        SELECT id
        FROM "Team"
        WHERE
          to_tsvector('simple', concat_ws(' ', coalesce("name", ''), coalesce("description", ''))) @@ websearch_to_tsquery('simple', $1)
          OR similarity(coalesce("name", ''), $1) > $3
        ORDER BY
          ts_rank(
            to_tsvector('simple', concat_ws(' ', coalesce("name", ''), coalesce("description", ''))),
            websearch_to_tsquery('simple', $1)
          ) DESC,
          similarity(coalesce("name", ''), $1) DESC,
          id DESC
        LIMIT $2
      `,
      input.query,
      12,
      input.fuzzyThreshold,
    )) ?? null;

  const tenantFilteredIds = rankedIds?.length
    ? await filterIdsForTenant("Team", rankedIds, input.tenantId)
    : null;

  const teams = await db.team.findMany({
    where: tenantFilteredIds?.length
      ? { id: { in: tenantFilteredIds } }
      : {
          OR: [
            ...containsClauses("name", terms),
            ...containsClauses("description", terms),
          ],
        },
    select: {
      id: true,
      name: true,
    },
    take: 12,
  });

  const allowedIds = await filterIdsForTenant(
    "Team",
    teams.map((team) => team.id),
    input.tenantId,
  );
  const filteredTeams = teams.filter((team) => allowedIds.includes(team.id));

  return tenantFilteredIds?.length ? orderByIds(filteredTeams, tenantFilteredIds) : filteredTeams;
}
