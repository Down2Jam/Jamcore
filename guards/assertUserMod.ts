import { Request, Response, NextFunction } from "express";

import { isModerator } from "../domain/userPolicies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserMod(_req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!isModerator(res.locals.user)) {
    next(new ForbiddenError("User is not a mod."));
    return;
  }

  next();
}

export default assertUserMod;
