import { Request, Response, NextFunction } from "express";

import { appConfig } from "../config/app.js";
import db from "../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";

async function getScoreLeaderboard(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!res.locals.score) {
    next(new UnauthorizedError("Score not loaded."));
    return;
  }

  const leaderboard = await db.gamePageLeaderboard.findUnique({
    where: {
      id: res.locals.score.leaderboardId,
    },
    include: {
      gamePage: {
        include: {
          game: true,
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

  res.locals.leaderboard = leaderboard;
  next();
}

export default getScoreLeaderboard;
