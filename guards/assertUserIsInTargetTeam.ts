import { Request, Response, NextFunction } from "express";

import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { requireRequestUser, requireTargetTeam } from "../lib/locals.js";

async function assertUserIsInTargetTeam(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const targetTeam = requireTargetTeam(res);
    const user = requireRequestUser(res);

    if (!targetTeam.users.some((member) => member.id === user.id)) {
      next(new ForbiddenError("User is not in team."));
      return;
    }

    next();
  } catch (error) {
    next(
      error instanceof Error
        ? new UnauthorizedError(error.message)
        : new UnauthorizedError("User not loaded."),
    );
  }
}

export default assertUserIsInTargetTeam;
