import { activeRatingSelect, activeRatingPageSelect, isActiveGameRating } from "../ratings/active.js";
import { PageVersion, type Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { TTLCache } from "../../lib/cache.js";
import { NotFoundError } from "../../lib/errors.js";
import { resolveJamReference } from "../jams/index.js";
import {
  gameListingInclude,
  gameListingSummaryInclude,
} from "../../prisma/selects.js";
import { materializeGameListingEntries } from "./presenters.js";
import { toGameListingResponse } from "./listing.response.js";
import {
  OVERALL_RATING_CATEGORY_NAME,
  isAllowedJamRater,
  isNonCompetitiveGameCategory,
} from "./policies.js";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "../users/recommendations.core.js";
import { buildPreferenceScorer, type PreferenceReason } from "./recommendation.personalization.js";
import { loadPreferenceExamples } from "./recommendation.profile.js";
import type {
  GameListingRecord,
  GameListingSort,
  ListingPageVersion,
} from "../../types/gameListing.js";

const SCORE_SORT_RATING_GOAL = 5;
const SCORE_SORT_MIDPOINT = 6;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const RANDOM_CURSOR_PREFIX = "random";

type ListedGame = ReturnType<typeof materializeGameListingEntries>[number];
type GameListingResult = {
  items: ReturnType<typeof toGameListingResponse>[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
    totalCount: number;
  };
};
type RecommendationRating = {
  category: { always: boolean };
  value: number;
  categoryId: number;
  userId: number;
  gameId: number;
  updatedAt: Date;
  gamePage: {
    version: PageVersion;
    ratingCategories: Array<{ id: number }>;
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

// The listing rankings are expensive and identical for every visitor within a
// tenant. Keep them longer than the five-minute background warming interval so
// a request never has to become the cache warmer because of minor job drift.
const gameListingCache = new TTLCache<GameListingResult>(10 * 60_000, "game-listings");
const personalizedListingCache = new Map<string, {
  expiresAt: number;
  value: Promise<GameListingResult>;
}>();
const PERSONALIZED_CACHE_TTL_MS = 60_000;
const PERSONALIZED_CACHE_MAX_ENTRIES = 200;

export function clearGameListingCache() {
  personalizedListingCache.clear();
  return gameListingCache.clear();
}

export const gameListingQuerySchema = z.object({
  sort: z.unknown().optional(),
  jamId: z.unknown().optional(),
  jamSlug: z.unknown().optional(),
  externalJams: z.unknown().optional(),
  pageVersion: z.unknown().optional(),
  cursor: z.unknown().optional(),
  limit: z.unknown().optional(),
});

export const recommendationPreviewQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  jamId: z.coerce.number().int().positive().optional(),
  pageVersion: z.enum(["JAM", "POST_JAM", "ALL"]).default("JAM"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(24),
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

function listingCursorFor(game: Pick<ListedGame, "id" | "pageVersion">) {
  return `${game.id}:${game.pageVersion ?? PageVersion.JAM}`;
}

function compareListingIdentity(a: ListedGame, b: ListedGame) {
  return (
    b.id - a.id ||
    (b.pageVersion ?? PageVersion.JAM).localeCompare(
      a.pageVersion ?? PageVersion.JAM,
    )
  );
}

function parseRandomCursor(cursor: string | null) {
  if (!cursor) {
    return null;
  }

  const [prefix, seed, rawOffset, extra] = cursor.split(":");
  const offset = Number.parseInt(rawOffset ?? "", 10);
  if (
    prefix !== RANDOM_CURSOR_PREFIX ||
    !/^[a-f0-9]{16}$/.test(seed ?? "") ||
    !/^\d+$/.test(rawOffset ?? "") ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    extra !== undefined
  ) {
    return null;
  }

  return { seed, offset };
}

function randomCursorFor(seed: string, offset: number) {
  return `${RANDOM_CURSOR_PREFIX}:${seed}:${offset}`;
}

function randomRank(seed: string, game: ListedGame) {
  const value = `${seed}:${listingCursorFor(game)}`;
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function sortRandomly(games: ListedGame[], seed: string) {
  return [...games].sort(
    (a, b) =>
      randomRank(seed, a) - randomRank(seed, b) ||
      listingCursorFor(a).localeCompare(listingCursorFor(b)),
  );
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

function getListingOrderBy(
  sort?: GameListingSort,
): Prisma.GameOrderByWithRelationInput[] | undefined {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "newest":
      return [{ createdAt: "desc" }, { id: "desc" }];
    default:
      return sort
        ? undefined
        : [{ createdAt: "desc" }, { id: "desc" }];
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
      compareListingIdentity(a, b),
  );
}

function sortByLeastRated(games: ListedGame[], ratingCategoryCount: number) {
  return [...games].sort((a, b) => {
    const aRatingRatio =
      a.ratings.length / (a.ratingCategories.length + ratingCategoryCount);
    const bRatingRatio =
      b.ratings.length / (b.ratingCategories.length + ratingCategoryCount);

    return aRatingRatio - bRatingRatio || compareListingIdentity(a, b);
  });
}

function sortByDanger(games: ListedGame[], ratingCategoryCount: number) {
  return [...games]
    .filter((game) => !isNonCompetitiveGameCategory(game.category))
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
      return normB - normA || compareListingIdentity(a, b);
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
              ? 1 / ((rating.gamePage?.ratingCategories ?? rating.game.ratingCategories).length + ratingCategoryCount)
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
              !isNonCompetitiveGameCategory(team.game.category),
          ).length > 0,
      ).length /
      (game.ratingCategories.length + ratingCategoryCount);

    return given - gotten;
  };

  return [...games].sort(
    (a, b) => diff(b) - diff(a) || compareListingIdentity(a, b),
  );
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
      ...activeRatingSelect,
      gameId: true,
      userId: true,
      categoryId: true,
      value: true,
      updatedAt: true,
      gamePage: {
        select: {
          ...activeRatingPageSelect,
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
    if (!isActiveGameRating(rating) || !isAllowedRaterInJam(rating, rating.game.jamId)) {
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
    if (!isActiveGameRating(rating) || !isAllowedRaterInJam(rating, rating.game.jamId)) {
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

type RankedGame = {
  game: ListedGame;
  baseScore: number;
  adjustment: number;
  reasons: PreferenceReason[];
};

async function rankByKarmaOrRecommended(
  games: ListedGame[],
  ratingCategories: Array<{ id: number; name: string }>,
  sort: "karma" | "recommended",
  viewerId?: number,
  tenantId?: string | null,
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
  const preferenceScorer =
    sort === "recommended" && viewerId
      ? buildPreferenceScorer(
          await loadPreferenceExamples(viewerId, overallCategoryId, tenantId),
          games,
        )
      : null;
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
              ? 1 / ((rating.gamePage?.ratingCategories ?? rating.game.ratingCategories).length + ratingCategories.length)
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
              !isNonCompetitiveGameCategory(team.game.category),
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

  const ranked: RankedGame[] = games.map((game) => {
    const recommendationBoost = sort === "recommended"
      ? recommendationWeight *
        (recommendedPointsByGameId.get(
          recommendationKeyFor(game.id, game.pageVersion ?? PageVersion.JAM),
        ) ?? 0) ** exponent
      : 0;
    const preference = preferenceScorer?.(game) ?? { adjustment: 0, reasons: [] };

    return {
      game,
      baseScore: karmaScore(game) + recommendationBoost,
      adjustment: preference.adjustment,
      reasons: preference.reasons,
    };
  });
  return ranked.sort((a, b) =>
    b.baseScore + b.adjustment - (a.baseScore + a.adjustment) ||
    compareListingIdentity(a.game, b.game),
  );
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

export async function previewRecommendedGames({
  viewerId,
  jamId,
  pageVersion,
  offset,
  limit,
  tenantId,
}: {
  viewerId: number;
  jamId?: number;
  pageVersion: ListingPageVersion;
  offset: number;
  limit: number;
  tenantId?: string | null;
}) {
  const [viewer, allowedUserIds] = await Promise.all([
    db.user.findUnique({
      where: { id: viewerId },
      select: { id: true, name: true, slug: true },
    }),
    filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: [viewerId],
      tenantId,
    }),
  ]);
  if (!viewer || !allowedUserIds.includes(viewerId)) {
    throw new NotFoundError("User not found.");
  }

  const games = await db.game.findMany({
    include: gameListingInclude,
    where: { published: true, ...(jamId ? { jamId } : {}) },
  });
  const tenantGames = await filterGameRecordsByTenant(games, tenantId);
  const listedGames = tenantGames.flatMap((game: GameListingRecord) =>
    materializeGameListingEntries(game, pageVersion),
  );
  const ratingCategories = await db.ratingCategory.findMany({
    where: { always: true },
    select: { id: true, name: true },
  });
  const personalized = await rankByKarmaOrRecommended(
    listedGames,
    ratingCategories,
    "recommended",
    viewerId,
    tenantId,
  );
  const baseline = [...personalized].sort((a, b) =>
    b.baseScore - a.baseScore || compareListingIdentity(a.game, b.game),
  );
  const baselineRanks = new Map(baseline.map((entry, index) => [listingCursorFor(entry.game), index + 1]));
  const personalizedRanks = new Map(personalized.map((entry, index) => [listingCursorFor(entry.game), index + 1]));
  const toPreviewItem = (entry: RankedGame, index: number, otherRanks: Map<string, number>) => ({
    game: toGameListingResponse(entry.game),
    rank: offset + index + 1,
    otherRank: otherRanks.get(listingCursorFor(entry.game)) ?? null,
    baseScore: entry.baseScore,
    adjustment: entry.adjustment,
    reasons: entry.reasons,
  });

  return {
    viewer,
    baseline: baseline.slice(offset, offset + limit).map((entry, index) =>
      toPreviewItem(entry, index, personalizedRanks),
    ),
    personalized: personalized.slice(offset, offset + limit).map((entry, index) =>
      toPreviewItem(entry, index, baselineRanks),
    ),
    pageInfo: {
      totalCount: listedGames.length,
      hasMore: offset + limit < listedGames.length,
      nextOffset: offset + limit < listedGames.length ? offset + limit : null,
    },
  };
}

export async function listGames({
  sort,
  jamId,
  jamSlug,
  externalJams,
  pageVersion,
  cursor,
  limit,
  tenantId,
  viewerId,
  refresh = false,
}: {
  sort?: unknown;
  jamId?: unknown;
  jamSlug?: unknown;
  externalJams?: unknown;
  pageVersion: ListingPageVersion;
  cursor?: unknown;
  limit?: unknown;
  tenantId?: string | null;
  viewerId?: number;
  refresh?: boolean;
}): Promise<GameListingResult> {
  const normalizedSort = parseGameListingSort(sort);
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = parseCursor(cursor);
  const randomCursor =
    normalizedSort === "random" ? parseRandomCursor(normalizedCursor) : null;
  const externalJamsOnly = externalJams === true || externalJams === "true";
  const where: Prisma.GameWhereInput = { published: true };
  const resolvedJam =
    !externalJamsOnly &&
    (typeof jamSlug === "string" || typeof jamId === "string" || typeof jamId === "number")
      ? await resolveJamReference({
          jamId: typeof jamId === "string" || typeof jamId === "number" ? jamId : null,
          jamSlug: typeof jamSlug === "string" ? jamSlug : null,
        })
      : null;

  if (externalJamsOnly) {
    where.jam = { sourcePlatform: { not: null } };
  } else if (resolvedJam) {
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
        totalCount: 0,
      },
    };
  }

  const cacheKey = JSON.stringify({
    sort: normalizedSort ?? null,
    jamId: where.jamId ?? null,
    jamSlug: resolvedJam?.slug ?? (typeof jamSlug === "string" ? jamSlug.trim() : null),
    externalJams: externalJamsOnly,
    pageVersion,
    cursor: normalizedCursor,
    limit: normalizedLimit,
    tenantId: tenantId ?? null,
  });

  const loadListing = async () => {
    const randomSeed =
      normalizedSort === "random"
        ? randomCursor?.seed ?? randomBytes(8).toString("hex")
        : null;
    const pageVersionWhere: Prisma.GameWhereInput =
      pageVersion === PageVersion.POST_JAM
        ? { pages: { some: { version: PageVersion.POST_JAM } } }
        : pageVersion === "ALL"
          ? {
              pages: {
                some: {
                  version: { in: [PageVersion.JAM, PageVersion.POST_JAM] },
                },
              },
            }
          : { pages: { some: { version: PageVersion.JAM } } };
    const totalCount = await db.game.count({
      where: {
        ...where,
        ...pageVersionWhere,
        ...(tenantId
          ? { OR: [{ tenantId: null }, { tenantId }] }
          : {}),
      },
    });
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
          listedGames = sortRandomly(listedGames, randomSeed!);
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
          listedGames = (await rankByKarmaOrRecommended(
            listedGames,
            ratingCategories,
            normalizedSort,
            viewerId,
            tenantId,
          )).map((entry) => entry.game);
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
        materializeGameListingEntries(
          game as unknown as GameListingRecord,
          pageVersion,
        ),
      );
    }

    let slicedGames =
      normalizedSort === "random" && randomCursor
        ? listedGames.slice(randomCursor.offset)
        : listedGames;
    if (normalizedCursor && expensiveSort) {
      const cursorIndex = listedGames.findIndex(
        (game) =>
          listingCursorFor(game) === normalizedCursor ||
          String(game.id) === normalizedCursor,
      );
      slicedGames = cursorIndex >= 0 ? listedGames.slice(cursorIndex + 1) : listedGames;
    }

    const hasMore = slicedGames.length > normalizedLimit;
    const items = slicedGames.slice(0, normalizedLimit).map(toGameListingResponse);

    return {
      items,
      pageInfo: {
        hasMore,
        nextCursor:
          hasMore && items.length > 0
            ? normalizedSort === "random"
              ? randomCursorFor(
                  randomSeed!,
                  (randomCursor?.offset ?? 0) + items.length,
                )
              : expensiveSort
              ? listingCursorFor(items[items.length - 1])
              : String(items[items.length - 1]?.id ?? "")
            : null,
        limit: normalizedLimit,
        totalCount,
      },
    };
  };

  if (normalizedSort === "recommended" && viewerId) {
    const personalizedKey = JSON.stringify([viewerId, cacheKey]);
    const cached = personalizedListingCache.get(personalizedKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    personalizedListingCache.delete(personalizedKey);
    const value = loadListing().catch((error) => {
      if (personalizedListingCache.get(personalizedKey)?.value === value) {
        personalizedListingCache.delete(personalizedKey);
      }
      throw error;
    });
    personalizedListingCache.set(personalizedKey, {
      expiresAt: Date.now() + PERSONALIZED_CACHE_TTL_MS,
      value,
    });
    if (personalizedListingCache.size > PERSONALIZED_CACHE_MAX_ENTRIES) {
      const oldestKey = personalizedListingCache.keys().next().value;
      if (oldestKey) personalizedListingCache.delete(oldestKey);
    }
    return value;
  }

  return refresh
    ? gameListingCache.refresh(cacheKey, loadListing)
    : gameListingCache.getOrSet(cacheKey, loadListing);
}
