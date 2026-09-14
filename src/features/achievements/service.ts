import { z } from "zod";

import type { Prisma } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { assertGameBelongsToTenant } from "../../lib/contentTenant.js";
import { NotFoundError } from "../../lib/errors.js";

const RECENT_ACHIEVEMENT_LIMIT = 10;
const RECENT_ACHIEVEMENT_CANDIDATE_LIMIT = 100;

export type AchievementRarityTier =
  | "Abyssal"
  | "Diamond"
  | "Gold"
  | "Silver"
  | "Bronze"
  | "Default";

const rarityRank: Record<AchievementRarityTier, number> = {
  Abyssal: 5,
  Diamond: 4,
  Gold: 3,
  Silver: 2,
  Bronze: 1,
  Default: 0,
};

function userTenantWhere(tenantId?: string | null): Prisma.UserWhereInput {
  if (!tenantId) return {};
  if (appConfig.platform.multiTenant.strictIsolation) return { tenantId };
  return { OR: [{ tenantId }, { tenantId: null }] };
}

function getRarityTier(
  earnedCount: number,
  engagedCount: number,
): { tier: AchievementRarityTier; earnedPercent: number } {
  const earnedPercent =
    engagedCount > 0 ? (earnedCount / engagedCount) * 100 : 0;

  if (engagedCount >= 40 && earnedPercent <= 5) {
    return { tier: "Abyssal", earnedPercent };
  }
  if (engagedCount >= 20 && earnedPercent <= 10) {
    return { tier: "Diamond", earnedPercent };
  }
  if (engagedCount >= 10 && earnedPercent <= 25) {
    return { tier: "Gold", earnedPercent };
  }
  if (engagedCount >= 5 && earnedPercent <= 50) {
    return { tier: "Silver", earnedPercent };
  }
  if (engagedCount >= 5 && earnedPercent <= 100) {
    return { tier: "Bronze", earnedPercent };
  }
  return { tier: "Default", earnedPercent };
}

export const achievementConnectionSchema = z.object({
  achievementId: z.coerce.number().int().positive(),
});

async function assertAchievementExists(
  achievementId: number,
  tenantId?: string | null,
) {
  const achievement = await db.gamePageAchievement.findFirst({
    where: {
      id: achievementId,
    },
    include: {
      gamePage: {
        select: {
          game: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!achievement) {
    throw new NotFoundError("No achievement exists with that id");
  }

  await assertGameBelongsToTenant(achievement.gamePage.game.id, tenantId);
}

export async function connectAchievementToUser({
  achievementId,
  userId,
  tenantId,
}: {
  achievementId: number;
  userId: number;
  tenantId?: string | null;
}) {
  await assertAchievementExists(achievementId, tenantId);

  const [, unlock] = await db.$transaction([
    db.gamePageAchievement.update({
      where: {
        id: achievementId,
      },
      data: {
        users: {
          connect: { id: userId },
        },
      },
    }),
    db.achievementUnlock.upsert({
      where: {
        achievementId_userId: { achievementId, userId },
      },
      create: { achievementId, userId },
      update: {},
    }),
  ]);
  return unlock;
}

export async function disconnectAchievementFromUser({
  achievementId,
  userId,
  tenantId,
}: {
  achievementId: number;
  userId: number;
  tenantId?: string | null;
}) {
  await assertAchievementExists(achievementId, tenantId);

  await db.$transaction([
    db.gamePageAchievement.update({
      where: {
        id: achievementId,
      },
      data: {
        users: {
          disconnect: { id: userId },
        },
      },
    }),
    db.achievementUnlock.deleteMany({
      where: { achievementId, userId },
    }),
  ]);
}

export async function listRecentAchievementUnlocks(
  tenantId?: string | null,
  limit = RECENT_ACHIEVEMENT_LIMIT,
  jamId?: number,
) {
  const unlocks = await db.achievementUnlock.findMany({
    where: {
      user: userTenantWhere(tenantId),
      achievement: {
        gamePage: {
          game: {
            published: true,
            ...(jamId === undefined ? {} : { jamId }),
          },
        },
      },
    },
    orderBy: [{ earnedAt: "desc" }, { achievementId: "desc" }],
    take: RECENT_ACHIEVEMENT_CANDIDATE_LIMIT,
    select: {
      earnedAt: true,
      user: {
        select: {
          id: true,
          slug: true,
          name: true,
          profilePicture: true,
        },
      },
      achievement: {
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          _count: { select: { users: true } },
          gamePage: {
            select: {
              id: true,
              version: true,
              name: true,
              thumbnail: true,
              achievements: {
                select: { users: { select: { id: true } } },
              },
              leaderboards: {
                select: { scores: { select: { userId: true } } },
              },
              ratings: { select: { userId: true } },
              game: {
                select: {
                  id: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const candidates = unlocks.map((unlock) => {
    const { achievement } = unlock;
    const { gamePage } = achievement;
    const engagedUserIds = new Set<number>();

    for (const gameAchievement of gamePage.achievements) {
      for (const user of gameAchievement.users) engagedUserIds.add(user.id);
    }
    for (const leaderboard of gamePage.leaderboards) {
      for (const score of leaderboard.scores) engagedUserIds.add(score.userId);
    }
    for (const rating of gamePage.ratings) engagedUserIds.add(rating.userId);

    const earnedCount = achievement._count.users;
    const engagedCount = engagedUserIds.size;
    const { tier, earnedPercent } = getRarityTier(earnedCount, engagedCount);

    return {
      achievement: {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        image: achievement.image,
      },
      user: unlock.user,
      game: {
        id: gamePage.game.id,
        slug: gamePage.game.slug,
        name: gamePage.name,
        thumbnail: gamePage.thumbnail,
        pageVersion: gamePage.version,
      },
      earnedAt: unlock.earnedAt,
      earnedCount,
      engagedCount,
      earnedPercent,
      tier,
      rank: rarityRank[tier],
    };
  });
  const selected = [] as typeof candidates;
  const selectedUserIds = new Set<number>();
  const selectedGameIds = new Set<number>();
  const candidatesByQuality = [...candidates].sort(
    (left, right) =>
      right.rank - left.rank ||
      left.earnedCount - right.earnedCount ||
      right.earnedAt.getTime() - left.earnedAt.getTime() ||
      right.achievement.id - left.achievement.id,
  );

  for (const candidate of candidatesByQuality) {
    if (selectedUserIds.has(candidate.user.id)) continue;
    if (selectedGameIds.has(candidate.game.id)) continue;

    selected.push(candidate);
    selectedUserIds.add(candidate.user.id);
    selectedGameIds.add(candidate.game.id);
    if (selected.length === limit) break;
  }

  return selected
    .sort((left, right) => right.earnedAt.getTime() - left.earnedAt.getTime())
    .slice(0, limit);
}

