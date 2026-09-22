import { z } from "zod";

import type { Prisma } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { createNotification } from "../notifications/delivery.js";

const RECENT_SCORE_LIMIT = 10;
const RECENT_SCORE_CANDIDATE_LIMIT = 100;

type ScoreLeaderboardType = "SCORE" | "GOLF" | "SPEEDRUN" | "ENDURANCE";

function userTenantWhere(tenantId?: string | null): Prisma.UserWhereInput {
  if (!tenantId) return {};
  if (appConfig.platform.multiTenant.strictIsolation) return { tenantId };
  return { OR: [{ tenantId }, { tenantId: null }] };
}

function isLowerBetter(type: ScoreLeaderboardType) {
  return type === "GOLF" || type === "SPEEDRUN";
}

export const createScoreSchema = z.object({
  score: z.number(),
  evidence: z.string().trim().min(1).optional(),
  evidenceUrl: z.string().trim().min(1).optional(),
});

type ScoreActor = {
  id: number;
};

type ScoreLeaderboard = {
  id: number;
  type: string;
  decimalPlaces: number;
  name?: string;
  onlyBest?: boolean;
  gamePage?: {
    name?: string | null;
    game?: {
      id?: number;
      slug?: string;
    };
  };
};

type PlacementAlertThreshold = 1 | 3 | 5;

function placementAlertThreshold(
  placement: number,
): PlacementAlertThreshold | null {
  if (placement === 1) return 1;
  if (placement <= 3) return 3;
  if (placement <= 5) return 5;
  return null;
}

function placementAlertCopy(threshold: PlacementAlertThreshold) {
  if (threshold === 1) {
    return {
      type: "LEADERBOARD_TOP_SPOT_LOST" as const,
      title: "You lost the top spot",
      band: "top spot",
    };
  }

  if (threshold === 3) {
    return {
      type: "LEADERBOARD_TOP_THREE_LOST" as const,
      title: "You dropped out of the top 3",
      band: "top 3",
    };
  }

  return {
    type: "LEADERBOARD_TOP_FIVE_LOST" as const,
    title: "You dropped out of the top 5",
    band: "top 5",
  };
}

async function createScoreWithPlacementNotifications({
  data,
  actor,
  leaderboard,
  gameId,
  gameSlug,
}: {
  data: Prisma.ScoreUncheckedCreateInput;
  actor: ScoreActor;
  leaderboard: ScoreLeaderboard;
  gameId: number;
  gameSlug: string;
}) {
  return db.$transaction(async (tx) => {
    const score = await tx.score.create({ data });
    const lowerBetter = isLowerBetter(leaderboard.type as ScoreLeaderboardType);
    const scores = await tx.score.findMany({
      where: { leaderboardId: leaderboard.id },
      orderBy: [
        { data: lowerBetter ? "asc" : "desc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        userId: true,
        placementAlertThreshold: true,
        placementAlertSentAt: true,
      },
    });

    const seenUserIds = new Set<number>();
    const rankedScores = leaderboard.onlyBest
      ? scores.filter((entry) => {
          if (seenUserIds.has(entry.userId)) return false;
          seenUserIds.add(entry.userId);
          return true;
        })
      : scores;
    const placementByScoreId = new Map(
      rankedScores.map((entry, index) => [entry.id, index + 1]),
    );

    for (const watchedScore of scores) {
      const threshold = watchedScore.placementAlertThreshold as
        | PlacementAlertThreshold
        | null;
      if (
        watchedScore.userId === actor.id ||
        threshold === null ||
        watchedScore.placementAlertSentAt !== null
      ) {
        continue;
      }

      const placement = placementByScoreId.get(watchedScore.id);
      if (placement !== undefined && placement <= threshold) continue;

      const claimed = await tx.$executeRaw`
        UPDATE "Score"
        SET "placementAlertSentAt" = ${new Date()}
        WHERE id = ${watchedScore.id}
          AND "placementAlertThreshold" = ${threshold}
          AND "placementAlertSentAt" IS NULL
      `;
      if (claimed !== 1) continue;

      const copy = placementAlertCopy(threshold);
      const gameName = leaderboard.gamePage?.name?.trim() || "this game";
      const leaderboardName = leaderboard.name?.trim() || "the leaderboard";

      await createNotification({
        type: copy.type,
        title: copy.title,
        body: `Your score on ${gameName}'s ${leaderboardName} leaderboard was knocked out of the ${copy.band}.`,
        link: `/g/${gameSlug}`,
        data: {
          leaderboardId: leaderboard.id,
          leaderboardName,
          gameName,
          gameSlug,
          scoreId: watchedScore.id,
          threshold,
        },
        actorId: actor.id,
        recipientId: watchedScore.userId,
        gameId,
      }, tx);
    }

    const newPlacement = placementByScoreId.get(score.id);
    const newThreshold = newPlacement
      ? placementAlertThreshold(newPlacement)
      : null;

    if (newThreshold !== null) {
      await tx.$executeRaw`
        UPDATE "Score" AS score
        SET
          "placementAlertThreshold" = NULL,
          "placementAlertSentAt" = NULL
        FROM "GamePageLeaderboard" AS leaderboard, "GamePage" AS page
        WHERE score."leaderboardId" = leaderboard.id
          AND leaderboard."gamePageId" = page.id
          AND page."gameId" = ${gameId}
          AND score."userId" = ${actor.id}
          AND score."placementAlertThreshold" IS NOT NULL
      `;
      await tx.$executeRaw`
        UPDATE "Score"
        SET "placementAlertThreshold" = ${newThreshold}
        WHERE id = ${score.id}
      `;
    }

    return score;
  });
}

export async function createScore({
  input,
  actor,
  leaderboard,
}: {
  input: z.infer<typeof createScoreSchema>;
  actor: ScoreActor;
  leaderboard: ScoreLeaderboard;
}) {
  const normalizedEvidence = input.evidence ?? input.evidenceUrl ?? "";
  const multiplier =
    leaderboard.type === "SCORE" || leaderboard.type === "GOLF"
      ? 10 ** leaderboard.decimalPlaces
      : 1;
  const data = {
    evidence: normalizedEvidence,
    data: input.score * multiplier,
    userId: actor.id,
    leaderboardId: leaderboard.id,
  };
  const gameId = leaderboard.gamePage?.game?.id;
  const gameSlug = leaderboard.gamePage?.game?.slug;

  if (!gameId || !gameSlug || leaderboard.onlyBest === undefined) {
    return db.score.create({ data });
  }

  return createScoreWithPlacementNotifications({
    data,
    actor,
    leaderboard,
    gameId,
    gameSlug,
  });
}

export async function deleteScore(scoreId: number) {
  await db.score.delete({
    where: {
      id: scoreId,
    },
  });
}

export async function listRecentTopScores(
  tenantId?: string | null,
  limit = RECENT_SCORE_LIMIT,
  jamId?: number,
) {
  const recentScores = await db.score.findMany({
    where: {
      user: userTenantWhere(tenantId),
      leaderboard: {
        gamePage: {
          game: {
            published: true,
            ...(jamId === undefined ? {} : { jamId }),
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: RECENT_SCORE_CANDIDATE_LIMIT,
    select: {
      id: true,
      data: true,
      evidence: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          slug: true,
          name: true,
          profilePicture: true,
        },
      },
      leaderboard: {
        select: {
          id: true,
          name: true,
          type: true,
          decimalPlaces: true,
          onlyBest: true,
          gamePage: {
            select: {
              version: true,
              name: true,
              thumbnail: true,
              game: { select: { id: true, slug: true } },
            },
          },
        },
      },
    },
  });

  const leaderboardIds = [
    ...new Set(recentScores.map((score) => score.leaderboard.id)),
  ];
  if (leaderboardIds.length === 0) return [];

  const leaderboards = await db.gamePageLeaderboard.findMany({
    where: { id: { in: leaderboardIds } },
    select: {
      id: true,
      type: true,
      onlyBest: true,
      scores: {
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          data: true,
          userId: true,
          updatedAt: true,
        },
      },
    },
  });

  const placementsByLeaderboard = new Map<
    number,
    { placementByScoreId: Map<number, number>; total: number }
  >();

  for (const leaderboard of leaderboards) {
    let eligibleScores = leaderboard.scores;

    if (leaderboard.onlyBest) {
      const bestByUser = new Map<number, (typeof leaderboard.scores)[number]>();
      for (const score of leaderboard.scores) {
        const current = bestByUser.get(score.userId);
        const scoreIsBetter =
          !current ||
          (isLowerBetter(leaderboard.type)
            ? score.data < current.data
            : score.data > current.data);
        if (scoreIsBetter) bestByUser.set(score.userId, score);
      }
      eligibleScores = [...bestByUser.values()];
    }

    eligibleScores.sort((left, right) => {
      const valueDifference = isLowerBetter(leaderboard.type)
        ? left.data - right.data
        : right.data - left.data;
      return valueDifference || right.updatedAt.getTime() - left.updatedAt.getTime();
    });

    placementsByLeaderboard.set(leaderboard.id, {
      placementByScoreId: new Map(
        eligibleScores.map((score, index) => [score.id, index + 1]),
      ),
      total: eligibleScores.length,
    });
  }

  const qualifying = recentScores.flatMap((score) => {
    const standings = placementsByLeaderboard.get(score.leaderboard.id);
    const placement = standings?.placementByScoreId.get(score.id);
    if (!standings || !placement) return [];

    const percentile = (placement / standings.total) * 100;
    if (placement > 3 && percentile > 10) return [];

    const { gamePage } = score.leaderboard;
    return [
      {
        id: score.id,
        data: score.data,
        evidence: score.evidence,
        scoredAt: score.updatedAt,
        placement,
        totalScores: standings.total,
        percentile,
        user: score.user,
        leaderboard: {
          id: score.leaderboard.id,
          name: score.leaderboard.name,
          type: score.leaderboard.type,
          decimalPlaces: score.leaderboard.decimalPlaces,
        },
        game: {
          id: gamePage.game.id,
          slug: gamePage.game.slug,
          name: gamePage.name,
          thumbnail: gamePage.thumbnail,
          pageVersion: gamePage.version,
        },
      },
    ];
  });

  qualifying.sort(
    (left, right) =>
      left.placement - right.placement ||
      left.percentile - right.percentile ||
      right.scoredAt.getTime() - left.scoredAt.getTime() ||
      right.id - left.id,
  );

  const selected = [] as typeof qualifying;
  const selectedUserIds = new Set<number>();
  const selectedGameIds = new Set<number>();

  for (const score of qualifying) {
    if (selectedUserIds.has(score.user.id)) continue;
    if (selectedGameIds.has(score.game.id)) continue;

    selected.push(score);
    selectedUserIds.add(score.user.id);
    selectedGameIds.add(score.game.id);
    if (selected.length === limit) break;
  }

  return selected.sort(
    (left, right) => right.scoredAt.getTime() - left.scoredAt.getTime(),
  );
}

