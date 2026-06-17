import type { NextFunction, Request, Response } from "express";

import { canModerateUserTarget } from "../domain/userPolicies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserModOrUserTargetUser(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!res.locals.targetUser) {
    next(new UnauthorizedError("Target user not loaded."));
    return;
  }

  if (!canModerateUserTarget(res.locals.user, res.locals.targetUser)) {
    next(
      new ForbiddenError("Requesting user is not a mod and not the target user."),
    );
    return;
  }

  next();
}

export default assertUserModOrUserTargetUser;
