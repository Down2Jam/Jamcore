import { Request, Response, NextFunction } from "express";

/**
 * Middleware that sends an error if the requested team already has a game.
 * Requires getTargetTeam to be used previously in the middleware chain.
 */
function assertTargetTeamDoesNotHaveGame(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!res.locals.targetTeam) {
    res.status(502).send("Target Team not gotten.");
  }

  if (res.locals.targetTeam.game) {
    res.status(401).send("Team already has a game.");
    return;
  }

  next();
}

export default assertTargetTeamDoesNotHaveGame;
