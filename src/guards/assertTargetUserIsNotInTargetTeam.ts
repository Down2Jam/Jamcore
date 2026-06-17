import type { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import { requireTargetTeam, requireTargetUser } from "../lib/locals.js";

function assertTargetUserIsNotInTargetTeam(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const targetUser = requireTargetUser(res);
    const targetTeam = requireTargetTeam(res);
    const isTeamMember = targetTeam.users?.some(
      (member: { id: number }) => member.id === targetUser.id,
    );

    if (isTeamMember) {
      next(new ForbiddenError("Target user is already in the team."));
      return;
    }

    next();
  } catch (error) {
    next(
      error instanceof Error
        ? new UnauthorizedError(error.message)
        : new UnauthorizedError("Target user not loaded."),
    );
  }
}

export default assertTargetUserIsNotInTargetTeam;
