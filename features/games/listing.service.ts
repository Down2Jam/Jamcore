import { PageVersion } from "@prisma/client";
import { z } from "zod";

import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { TTLCache } from "../../lib/cache.js";
import { resolveJamReference } from "../jams/index.js";
import {
  gameListingInclude,
  gameListingSummaryInclude,
} from "../../prisma/selects.js";
import { materializeGameListingEntries } from "./presenters.js";
import {
  EXTRA_GAME_CATEGORY,
  OVERALL_RATING_CATEGORY_NAME,
  isAllowedJamRater,
} from "./policies.js";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "../users/recommendations.core.js";
import type {
  GameListingRecord,
  GameListingSort,
  ListingPageVersion,
} from "../../types/gameListing.js";

const SCORE_SORT_RATING_GOAL = 5;
const SCORE_SORT_MIDPOINT = 6;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

type ListedGame = ReturnType<typeof materializeGameListingEntries>[number];
type GameListingResult = {
  items: ListedGame[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
};
type RecommendationRating = {
  value: number;
  categoryId: number;
  userId: number;
  gameId: number;
  updatedAt: Date;
  gamePage: {
    version: PageVersion;
  } | null;
  game: {
    jamId: number;
  };
  user: {
    teams: Array<{
      game: {
        published: boolean;
        category: ListedGame["category"];
        jamId: number;
      } | null;
    }>;
  };
};

const gameListingCache = new TTLCache<GameListingResult>(30_000);

export function clearGameListingCache() {
  gameListingCache.clear();
}

export const gameListingQuerySchema = z.object({
  sort: z.unknown().optional(),
  jamId: z.unknown().optional(),
  jamSlug: z.unknown().optional(),
  pageVersion: z.unknown().optional(),
  cursor: z.unknown().optional(),
  limit: z.unknown().optional(),
});

function normalizeLimit(limit: unknown) {
  if (typeof limit === "number" && Number.isInteger(limit)) {
    return Math.min(Math.max(limit, 1), MAX_LIMIT);
  }

  if (typeof limit === "string") {
    const parsed = Number.parseInt(limit, 10);
    if (!Number.isNaN(parsed)) {
      return Math.min(Math.max(parsed, 1), MAX_LIMIT);
    }
  }

  return DEFAULT_LIMIT;
}

function parseCursor(cursor: unknown) {
  if (typeof cursor !== "string" || cursor.trim().length === 0) {
    return null;
  }

  return cursor;
}

function listingCursorFor(game: ListedGame) {
  return `${game.id}:${game.pageVersion ?? PageVersion.JAM}`;
}

function parseGameListingSort(value: unknown): GameListingSort | undefined {
  switch (value) {
    case "oldest":
    case "newest":
    case "danger":
    case "score":
    case "random":
    case "recommended":
    case "ratingbalance":
    case "karma":
    case "leastrated":
      return value;
    case "leastratings":
      return "leastrated";
    default:
      return undefined;
  }
}

function getListingOrderBy(sort?: GameListingSort) {
  switch (sort) {
    case "oldest":
      return { id: "asc" } as const;
    case "newest":
      return { id: "desc" } as const;
    default:
      return sort ? undefined : ({ id: "desc" } as const);
  }
}

function isExpensiveSort(sort?: GameListingSort) {
  return (
    sort === "score" ||
    sort === "danger" ||
    sort === "leastrated" ||
    sort === "ratingbalance" ||
    sort === "karma" ||
    sort === "recommended"
  );
}

function isAllowedRaterInJam(
  rating: ListedGame["ratings"][number] | RecommendationRating,
  jamId: number,
) {
  return rating.user.teams.some((team) => {
    return isAllowedJamRater(team.game, jamId);
  });
}

function sortByScore(games: ListedGame[]) {
  const getRatings = (game: ListedGame, version?: PageVersion) => {
    const allRatings =
      ((game as ListedGame & { allRatings?: ListedGame["ratings"] }).allRatings ??
        game.ratings) as ListedGame["ratings"];

    return allRatings.filter((rating) => {
      const numericValue = Number(rating.value);
      return (
        (version
          ? (rating.gamePage?.version ?? PageVersion.JAM) === version
          : true) &&
        rating.category?.name === OVERALL_RATING_CATEGORY_NAME &&
        Number.isFinite(numericValue) &&
        isAllowedRaterInJam(rating, game.jamId)
      );
    });
  };

  const getOverallRatings = (game: ListedGame) =>
    getRatings(game, game.pageVersion ?? PageVersion.JAM);

  const getAverage = (game: ListedGame) => {
    const overallRatings = getOverallRatings(game);
    if (overallRatings.length === 0) return SCORE_SORT_MIDPOINT;
    return (
      overallRatings.reduce((sum, rating) => sum + Number(rating.value), 0) /
      overallRatings.length
    );
  };

  const getAdjusted = (game: ListedGame) => {
    const overallRatings = getOverallRatings(game);
    if (overallRatings.length >= SCORE_SORT_RATING_GOAL) {
      return getAverage(game);
    }

    const missingOverallRatings = SCORE_SORT_RATING_GOAL - overallRatings.length;
    const jamOverallRatings =
      (game.pageVersion ?? PageVersion.JAM) === PageVersion.POST_JAM
        ? getRatings(game, PageVersion.JAM)
        : [];
    const jamAverage =
      jamOverallRatings.length > 0
        ? jamOverallRatings.reduce((sum, rating) => sum + Number(rating.value), 0) /
          jamOverallRatings.length
        : SCORE_SORT_MIDPOINT;
    const jamFillCount = Math.min(jamOverallRatings.length, missingOverallRatings);
    const midpointFillCount = missingOverallRatings - jamFillCount;

    return (
      overallRatings.reduce((sum, rating) => sum + Number(rating.value), 0) +
      jamFillCount * jamAverage +
      midpointFillCount * SCORE_SORT_MIDPOINT
    ) / SCORE_SORT_RATING_GOAL;
  };

  return [...games].sort(
    (a, b) =>
      getAdjusted(b) - getAdjusted(a) ||
      getAverage(b) - getAverage(a) ||
      getOverallRatings(b).length - getOverallRatings(a).length ||
      b.id - a.id,
  );
}

function sortByLeastRated(games: ListedGame[], ratingCategoryCount: number) {
  return [...games].sort(
    (a, b) =>
      a.ratings.length / (a.ratingCategories.length + ratingCategoryCount) -
      b.ratings.length / (b.ratingCategories.length + ratingCategoryCount),
  );
}

function sortByDanger(games: ListedGame[], ratingCategoryCount: number) {
  return [...games]
    .filter((game) => game.category !== EXTRA_GAME_CATEGORY)
    .filter((game) =>
      game.ratingCategories.some((category) => {
        const allowedCount = game.ratings.filter(
          (rating) =>
            rating.categoryId === category.id &&
            isAllowedRaterInJam(rating, game.jamId),
        ).length;
        return allowedCount < 5;
      }),
    )
    .sort((a, b) => {
      const allowedA = a.ratings.filter((rating) =>
        isAllowedRaterInJam(rating, a.jamId),
      ).length;
      const allowedB = b.ratings.filter((rating) =>
        isAllowedRaterInJam(rating, b.jamId),
      ).length;
      const normA = allowedA / (a.ratingCategories.length + ratingCategoryCount);
      const normB = allowedB / (b.ratingCategories.length + ratingCategoryCount);
      return normB - normA;
    });
}

function sortByRatingBalance(games: ListedGame[], ratingCategoryCount: number) {
  const diff = (game: ListedGame) => {
    const given = game.team.users.reduce(
      (sum, user) =>
        sum +
        user.ratings.reduce(
          (ratingSum, rating) =>
            ratingSum +
            (rating.game.jamId === game.jamId
              ? 1 / (rating.game.ratingCategories.length + ratingCategoryCount)
              : 0),
          0,
        ),
      0,
    );

    const gotten =
      game.ratings.filter(
        (rating) =>
          rating.user.teams.filter(
            (team) =>
              team.game &&
              team.game.jamId === game.jamId &&
              team.game.published &&
              team.game.category !== EXTRA_GAME_CATEGORY,
          ).length > 0,
      ).length /
      (game.ratingCategories.length + ratingCategoryCount);

    return given - gotten;
  };

  return [...games].sort((a, b) => diff(b) - diff(a));
}

async function getRecommendedPointsByGameKey(
  games: ListedGame[],
  ratingCategoryId: number | null,
) {
  const recommendedPointsByGameId = new Map<string, number>();
  if (!ratingCategoryId || games.length === 0) {
    return recommendedPointsByGameId;
  }

  const jamIds = [...new Set(games.map((game) => game.jamId))];
  const pageVersions = [
    ...new Set(games.map((game) => game.pageVersion ?? PageVersion.JAM)),
  ];
  const recommendationKeyFor = (gameId: number, version: PageVersion) =>
    `${gameId}:${version}`;
  const recommendationSlots = 3;

  const recommendationRatings = (await db.rating.findMany({
    where: {
      game: {
        jamId: { in: jamIds },
      },
      gamePage: {
        version: { in: pageVersions },
      },
    },
    select: {
      gameId: true,
      userId: true,
      categoryId: true,
      value: true,
      updatedAt: true,
      gamePage: {
        select: {
          version: true,
        },
      },
      game: {
        select: {
          jamId: true,
        },
      },
      user: {
        select: {
          teams: {
            select: {
              game: {
                select: {
                  published: true,
                  jamId: true,
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  })) satisfies RecommendationRating[];

  const ratingsByUser = new Map<
    number,
    Array<{
      gameId: number;
      jamId: number;
      pageVersion: PageVersion;
      value: number;
      tieBreakerValue: number;
      updatedAt: number;
    }>
  >();
  const ratingAveragesByUserGame = new Map<
    number,
    Map<number, { total: number; count: number }>
  >();

  recommendationRatings.forEach((rating) => {
    if (!isAllowedRaterInJam(rating, rating.game.jamId)) {
      return;
    }

    const averagesForUser = ratingAveragesByUserGame.get(rating.userId) ?? new Map();
    const aggregate = averagesForUser.get(rating.gameId) ?? { total: 0, count: 0 };
    aggregate.total += rating.value;
    aggregate.count += 1;
    averagesForUser.set(rating.gameId, aggregate);
    ratingAveragesByUserGame.set(rating.userId, averagesForUser);
  });

  recommendationRatings.forEach((rating) => {
    if (!isAllowedRaterInJam(rating, rating.game.jamId)) {
      return;
    }
    if (rating.categoryId !== ratingCategoryId) {
      return;
    }

    const existing = ratingsByUser.get(rating.userId) ?? [];
    const average = ratingAveragesByUserGame.get(rating.userId)?.get(rating.gameId);
    existing.push({
      gameId: rating.gameId,
      jamId: rating.game.jamId,
      pageVersion: rating.gamePage?.version ?? PageVersion.JAM,
      value: rating.value,
      tieBreakerValue: average ? average.total / average.count : rating.value,
      updatedAt: rating.updatedAt.getTime(),
    });
    ratingsByUser.set(rating.userId, existing);
  });

  const recommendationUsers = await db.user.findMany({
    where: { id: { in: [...ratingsByUser.keys()] } },
    select: {
      id: true,
      recommendedGameOverrideIds: true,
      recommendedGameHiddenIds: true,
    },
  });
  const recommendationUserMap = new Map(
    recommendationUsers.map((user) => [user.id, user]),
  );

  ratingsByUser.forEach((entries, userId) => {
    const ranking = rankRecommendationCandidates(
      entries.map((entry) => ({
        itemId: recommendationKeyFor(entry.gameId, entry.pageVersion),
        value: entry.value,
        tieBreakerValue: entry.tieBreakerValue,
        updatedAt: entry.updatedAt,
      })),
    );
    if (!ranking.eligible) {
      return;
    }

    const recommendationUser = recommendationUserMap.get(userId);
    applyRecommendationOverrides(
      ranking.candidateIds,
      (recommendationUser?.recommendedGameOverrideIds ?? []).map((gameId) =>
        recommendationKeyFor(gameId, PageVersion.JAM),
      ),
      (recommendationUser?.recommendedGameHiddenIds ?? []).map((gameId) =>
        recommendationKeyFor(gameId, PageVersion.JAM),
      ),
      recommendationSlots,
    )
      .filter((entryKey) =>
        entries.some(
          (entry) =>
            recommendationKeyFor(entry.gameId, entry.pageVersion) === entryKey &&
            jamIds.includes(entry.jamId),
        ),
      )
      .forEach((entryKey) => {
        const current = recommendedPointsByGameId.get(entryKey) ?? 0;
        recommendedPointsByGameId.set(entryKey, current + 1);
      });
  });

  return recommendedPointsByGameId;
}

async function sortByKarmaOrRecommended(
  games: ListedGame[],
  ratingCategories: Array<{ id: number; name: string }>,
  sort: "karma" | "recommended",
) {
  const exponent = 0.73412;
  const recommendationWeight = 2;
  const overallCategoryId =
    ratingCategories.find(
      (category) => category.name === OVERALL_RATING_CATEGORY_NAME,
    )?.id ?? null;
  const recommendedPointsByGameId = await getRecommendedPointsByGameKey(
    games,
    overallCategoryId,
  );
  const recommendationKeyFor = (gameId: number, version: PageVersion) =>
    `${gameId}:${version}`;

  const matchesLeaderboardForVersion = (
    score: ListedGame["team"]["users"][number]["scores"][number],
    gameId: number,
    version: PageVersion,
  ) =>
    score.leaderboard.gamePage?.gameId === gameId &&
    (score.leaderboard.gamePage?.version ?? PageVersion.JAM) === version;

  const karmaScore = (game: ListedGame) => {
    const given = game.team.users.reduce(
      (sum, user) =>
        sum +
        user.ratings.reduce(
          (ratingSum, rating) =>
            ratingSum +
            (rating.game.jamId === game.jamId
              ? 1 / (rating.game.ratingCategories.length + ratingCategories.length)
              : 0),
          0,
        ),
      0,
    );

    const gotten =
      game.ratings.filter(
        (rating) =>
          rating.user.teams.filter(
            (team) =>
              team.game &&
              team.game.jamId === game.jamId &&
              team.game.published &&
              team.game.category !== EXTRA_GAME_CATEGORY,
          ).length > 0,
      ).length /
      (game.ratingCategories.length + ratingCategories.length);

    const likes = game.team.users.reduce(
      (sum, user) =>
        sum +
        user.comments
          .filter(
            (comment) =>
              comment.gameId &&
              comment.game &&
              comment.gameId !== game.id &&
              comment.game.jamId === game.jamId,
          )
          .reduce(
            (likeSum, comment) =>
              likeSum +
              comment.likes.filter(
                (like) =>
                  game.team.users
                    .map((teamUser) => teamUser.id)
                    .filter((userId) => userId === like.userId).length === 0,
              ).length,
            0,
          ),
      0,
    );

    const scores = game.team.users.reduce(
      (sum, user) =>
        sum +
        [
          ...new Set(
            user.scores
              .filter(
                (score) =>
                  score.leaderboard.gamePage?.game?.jamId === game.jamId &&
                  matchesLeaderboardForVersion(
                    score,
                    game.id,
                    game.pageVersion ?? PageVersion.JAM,
                  ),
              )
              .map((score) => score.leaderboard.gamePageId),
          ),
        ].length,
      0,
    );

    const achievements = game.team.users.reduce(
      (sum, user) =>
        sum +
        [
          ...new Set(
            (user.gamePageAchievements ?? [])
              .filter(
                (achievement) =>
                  achievement.gamePage?.game?.jamId === game.jamId &&
                  (achievement.gamePage?.version ?? PageVersion.JAM) ===
                    (game.pageVersion ?? PageVersion.JAM),
              )
              .map((achievement) => achievement.gamePage?.gameId)
              .filter((gameId): gameId is number => Number.isInteger(gameId)),
          ),
        ].length,
      0,
    );

    return (
      given ** exponent +
      likes ** exponent +
      0.3333 * achievements ** exponent +
      0.3333 * scores ** exponent -
      gotten
    );
  };

  return [...games].sort((a, b) => {
    const aBoost =
      sort === "recommended"
        ? recommendationWeight *
          (recommendedPointsByGameId.get(
            recommendationKeyFor(a.id, a.pageVersion ?? PageVersion.JAM),
          ) ?? 0) **
            exponent
        : 0;
    const bBoost =
      sort === "recommended"
        ? recommendationWeight *
          (recommendedPointsByGameId.get(
            recommendationKeyFor(b.id, b.pageVersion ?? PageVersion.JAM),
          ) ?? 0) **
            exponent
        : 0;

    return karmaScore(b) + bBoost - (karmaScore(a) + aBoost);
  });
}

async function filterGameRecordsByTenant<T extends { id: number }>(
  games: T[],
  tenantId?: string | null,
) {
  const allowedIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: games.map((game) => game.id),
      tenantId,
    }),
  );

  return games.filter((game) => allowedIds.has(game.id));
}

export async function listGames({
  sort,
  jamId,
  jamSlug,
  pageVersion,
  cursor,
  limit,
  tenantId,
}: {
  sort?: unknown;
  jamId?: unknown;
  jamSlug?: unknown;
  pageVersion: ListingPageVersion;
  cursor?: unknown;
  limit?: unknown;
  tenantId?: string | null;
}): Promise<GameListingResult> {
  const normalizedSort = parseGameListingSort(sort);
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = parseCursor(cursor);
  const where: { published: true; jamId?: number } = { published: true };
  const resolvedJam =
    typeof jamSlug === "string" || typeof jamId === "string" || typeof jamId === "number"
      ? await resolveJamReference({
          jamId: typeof jamId === "string" || typeof jamId === "number" ? jamId : null,
          jamSlug: typeof jamSlug === "string" ? jamSlug : null,
        })
      : null;

  if (resolvedJam) {
    where.jamId = resolvedJam.id;
  } else if (
    (typeof jamSlug === "string" && jamSlug.trim().length > 0) ||
    (typeof jamId === "string" && jamId.trim().length > 0) ||
    typeof jamId === "number"
  ) {
    return {
      items: [],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit: normalizedLimit,
      },
    };
  }

  const cacheKey = JSON.stringify({
    sort: normalizedSort ?? null,
    jamId: where.jamId ?? null,
    jamSlug: resolvedJam?.slug ?? (typeof jamSlug === "string" ? jamSlug.trim() : null),
    pageVersion,
    cursor: normalizedCursor,
    limit: normalizedLimit,
    tenantId: tenantId ?? null,
  });

  return gameListingCache.getOrSet(cacheKey, async () => {
    const expensiveSort = isExpensiveSort(normalizedSort);
    let listedGames: ReturnType<typeof materializeGameListingEntries>;

    if (expensiveSort || normalizedSort === "random") {
      const games = await db.game.findMany({
        include: gameListingInclude,
        where,
        orderBy: getListingOrderBy(normalizedSort),
      });
      const tenantGames = await filterGameRecordsByTenant(games, tenantId);

      const ratingCategories = await db.ratingCategory.findMany({
        where: { always: true },
        select: { id: true, name: true },
      });

      listedGames = tenantGames.flatMap((game: GameListingRecord) =>
        materializeGameListingEntries(game, pageVersion),
      );

      switch (normalizedSort) {
        case "random":
          listedGames = [...listedGames].sort(() => Math.random() - 0.5);
          break;
        case "score":
          listedGames = sortByScore(listedGames);
          break;
        case "leastrated":
          listedGames = sortByLeastRated(listedGames, ratingCategories.length);
          break;
        case "danger":
          listedGames = sortByDanger(listedGames, ratingCategories.length);
          break;
        case "ratingbalance":
          listedGames = sortByRatingBalance(listedGames, ratingCategories.length);
          break;
        case "karma":
        case "recommended":
          listedGames = await sortByKarmaOrRecommended(
            listedGames,
            ratingCategories,
            normalizedSort,
          );
          break;
        default:
          break;
      }
    } else {
      const cursorId =
        normalizedCursor && /^\d+$/.test(normalizedCursor)
          ? Number.parseInt(normalizedCursor, 10)
          : undefined;

      const games = await db.game.findMany({
        include: gameListingSummaryInclude,
        where,
        orderBy: getListingOrderBy(normalizedSort),
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        take: normalizedLimit + 1,
      });
      const tenantGames = await filterGameRecordsByTenant(games, tenantId);

      listedGames = tenantGames.flatMap((game) =>
        materializeGameListingEntries(game as GameListingRecord, pageVersion),
      );
    }

    let slicedGames = listedGames;
    if (normalizedCursor && (expensiveSort || normalizedSort === "random")) {
      const cursorIndex = listedGames.findIndex(
        (game) =>
          listingCursorFor(game) === normalizedCursor ||
          String(game.id) === normalizedCursor,
      );
      slicedGames = cursorIndex >= 0 ? listedGames.slice(cursorIndex + 1) : listedGames;
    }

    const hasMore = slicedGames.length > normalizedLimit;
    const items = slicedGames.slice(0, normalizedLimit);

    return {
      items,
      pageInfo: {
        hasMore,
        nextCursor:
          hasMore && items.length > 0
            ? expensiveSort || normalizedSort === "random"
              ? listingCursorFor(items[items.length - 1])
              : String(items[items.length - 1]?.id ?? "")
            : null,
        limit: normalizedLimit,
      },
    };
  });
}
