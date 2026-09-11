import type { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../lib/errors.js";

/**
 * Restricts a game-token-authenticated request to the game the token was issued for. Session
 * requests are untouched -- a game token can only ever act on the one game it was linked to.
 */
export function assertGameTokenMatchesGame(getGameId: (res: Response) => number | null | undefined) {
  return function assertGameTokenMatchesGameMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (res.locals.authMethod !== "gameToken") {
      next();
      return;
    }

    const resolvedGameId = getGameId(res);
    if (!resolvedGameId || resolvedGameId !== res.locals.gameAccessTokenGameId) {
      next(new ForbiddenError("This game token is not authorized for this game."));
      return;
    }

    next();
  };
}
