import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@infra/db";
import { UnauthorizedError } from "@lib/errors";

var router = Router();

router.get(
  "/",
  rateLimit(60),

  authUser,
  getUser,

  async (_req, res) => {
    if (!res.locals.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const [followingCount, unlockedAchievements] = await Promise.all([
      db.userFollow.count({
        where: {
          followerId: res.locals.user.id,
          tenantId: res.locals.tenantId ?? null,
        },
      }),
      db.gamePageAchievement.findMany({
        where: { users: { some: { id: res.locals.user.id } } },
        select: {
          id: true,
          gamePageId: true,
          gamePage: {
            select: {
              gameId: true,
              version: true,
              _count: { select: { achievements: true } },
            },
          },
        },
      }),
    ]);

    const progress = new Map<number, {
      gameId: number;
      pageVersion: string;
      total: number;
      unlockedIds: Set<number>;
    }>();

    for (const achievement of unlockedAchievements) {
      const page = achievement.gamePage;
      const entry = progress.get(achievement.gamePageId) ?? {
        gameId: page.gameId,
        pageVersion: page.version,
        total: page._count.achievements,
        unlockedIds: new Set<number>(),
      };
      entry.unlockedIds.add(achievement.id);
      progress.set(achievement.gamePageId, entry);
    }

    const perfectedGamePages = [...progress.values()]
      .filter((entry) => entry.total > 0 && entry.unlockedIds.size === entry.total)
      .map(({ gameId, pageVersion }) => ({ gameId, pageVersion }));

    res.json({
      ...res.locals.user,
      followingCount,
      perfectedGamePages,
    });
  }
);

export default router;

