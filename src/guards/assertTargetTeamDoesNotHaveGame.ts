import { Request, Response, NextFunction } from "express";

import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertTargetTeamDoesNotHaveGame(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.targetTeam) {
    next(new UnauthorizedError("Target team not loaded."));
    return;
  }

  if (res.locals.targetTeam.game) {
    next(new ForbiddenError("Team already has a game."));
    return;
  }

  next();
}

export default assertTargetTeamDoesNotHaveGame;
