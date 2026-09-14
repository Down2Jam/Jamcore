import { z } from "zod";

import type { Prisma } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";

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
};

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

  return db.score.create({
    data: {
      evidence: normalizedEvidence,
      data: input.score * multiplier,
      userId: actor.id,
      leaderboardId: leaderboard.id,
    },
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

