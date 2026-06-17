import type { NextFunction, Request, Response } from "express";

import { canManageTargetTeam } from "../domain/userPolicies.js";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../lib/errors.js";

function assertUserModOrUserTargetTeamOwner(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!res.locals.targetTeam) {
    next(new ValidationError("Target team not loaded."));
    return;
  }

  if (!canManageTargetTeam(res.locals.user, res.locals.targetTeam)) {
    next(new ForbiddenError("User is not the team owner and is not a mod."));
    return;
  }

  next();
}

export default assertUserModOrUserTargetTeamOwner;
