import type { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserNotTargetTeamOwner(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!res.locals.targetTeam) {
    next(new UnauthorizedError("Target team not loaded."));
    return;
  }

  if (res.locals.targetTeam.ownerId === res.locals.user.id) {
    next(new ForbiddenError("User is the team owner."));
    return;
  }

  next();
}

export default assertUserNotTargetTeamOwner;
