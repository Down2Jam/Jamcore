import { Request, Response, NextFunction } from "express";

import db from "../infra/db.js";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";

async function getGameTeam(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!res.locals.game) {
    next(new UnauthorizedError("Game not loaded."));
    return;
  }

  const team = await db.team.findUnique({
    where: {
      id: res.locals.game.teamId,
    },
    include: {
      users: true,
    },
  });

  if (!team) {
    next(new NotFoundError("Team missing."));
    return;
  }

  res.locals.team = team;
  next();
}

export default getGameTeam;
