import { Request, Response, NextFunction } from "express";

import { NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { requireLoadedLeaderboard } from "../lib/locals.js";

async function getLeaderboardGame(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!res.locals.leaderboard) {
    next(new UnauthorizedError("Leaderboard not loaded."));
    return;
  }

  const leaderboard = requireLoadedLeaderboard<{
    gamePage?: {
      game?: Record<string, unknown> | null;
    } | null;
  }>(res);
  const game = leaderboard.gamePage?.game ?? null;

  if (!game) {
    next(new NotFoundError("Game missing."));
    return;
  }

  res.locals.game = game;
  next();
}

export default getLeaderboardGame;
