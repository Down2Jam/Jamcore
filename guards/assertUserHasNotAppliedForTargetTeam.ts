import type { NextFunction, Request, Response } from "express";

import {
  assertUserHasNotAppliedForTargetTeam as assertNoTeamApplication,
} from "@features/teams";
import { UnauthorizedError, ValidationError } from "../lib/errors.js";

async function assertUserHasNotAppliedForTargetTeam(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!res.locals.targetTeam) {
    next(new ValidationError("Target team not loaded."));
    return;
  }

  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  try {
    await assertNoTeamApplication({
      userId: res.locals.user.id,
      teamId: res.locals.targetTeam.id,
    });
    next();
  } catch (error) {
    next(error);
  }
}

export default assertUserHasNotAppliedForTargetTeam;
