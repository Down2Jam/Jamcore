import { Request, Response, NextFunction } from "express";

import { canManageScoreInTeamContext } from "../domain/userPolicies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserModOrUserTeamMemberOrUserScoreOwner(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!res.locals.score) {
    next(new UnauthorizedError("Score not loaded."));
    return;
  }

  if (!res.locals.team) {
    next(new UnauthorizedError("Team not loaded."));
    return;
  }

  if (
    !canManageScoreInTeamContext({
      user: res.locals.user,
      team: res.locals.team,
      score: res.locals.score,
    })
  ) {
    next(
      new ForbiddenError(
        "User is not in the team, not a mod, and not the score owner.",
      ),
    );
    return;
  }

  next();
}

export default assertUserModOrUserTeamMemberOrUserScoreOwner;
