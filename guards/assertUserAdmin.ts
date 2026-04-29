import type { NextFunction, Request, Response } from "express";

import { isAdmin } from "../domain/userPolicies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!isAdmin(res.locals.user)) {
    next(new ForbiddenError("User is not an admin."));
    return;
  }

  next();
}

export default assertUserAdmin;
