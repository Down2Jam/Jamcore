import { Request, Response, NextFunction } from "express";

import { appConfig } from "../config/app.js";
import db from "../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

async function getLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawLeaderboardId =
    req.body?.leaderboardId ?? req.params?.leaderboardId ?? req.query?.leaderboardId;
  const leaderboardId = Number(rawLeaderboardId);

  if (!leaderboardId) {
    next(new BadRequestError("No leaderboard id provided."));
    return;
  }

  const leaderboard = await db.gamePageLeaderboard.findUnique({
    where: {
      id: leaderboardId,
    },
    include: {
      gamePage: {
        include: {
          game: {
            select: {
              id: true,
              slug: true,
              jamId: true,
              category: true,
              published: true,
              teamId: true,
            },
          },
        },
      },
    },
  });

  if (!leaderboard) {
    next(new NotFoundError("Leaderboard missing."));
    return;
  }

  const gameId = leaderboard.gamePage?.game?.id;
  if (!gameId) {
    next(new NotFoundError("Leaderboard missing."));
    return;
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: gameId,
    tenantId: res.locals.tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    next(new NotFoundError("Leaderboard missing."));
    return;
  }

  res.locals.pageLeaderboard = leaderboard;
  res.locals.leaderboard = leaderboard;
  next();
}

export default getLeaderboard;
