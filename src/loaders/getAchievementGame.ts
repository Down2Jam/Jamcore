import { Request, Response, NextFunction } from "express";

import db from "../infra/db.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

async function getAchievementGame(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawAchievementId =
    req.body?.achievementId ?? req.params?.achievementId ?? req.query?.achievementId;
  const achievementId = Number(rawAchievementId);

  if (!achievementId) {
    next(new BadRequestError("No achievement id provided."));
    return;
  }

  const achievement = await db.gamePageAchievement.findUnique({
    where: { id: achievementId },
    include: {
      gamePage: {
        include: {
          game: {
            select: { id: true, slug: true },
          },
        },
      },
    },
  });

  if (!achievement) {
    next(new NotFoundError("Achievement missing."));
    return;
  }

  const gameId = achievement.gamePage?.game?.id;
  if (!gameId) {
    next(new NotFoundError("Achievement missing."));
    return;
  }

  res.locals.achievement = achievement;
  res.locals.game = { id: gameId };
  next();
}

export default getAchievementGame;
