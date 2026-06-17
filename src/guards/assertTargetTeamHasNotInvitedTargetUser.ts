import type { NextFunction, Request, Response } from "express";

import { assertTargetTeamHasNotInvitedUser } from "@features/teams";
import { requireTargetTeam, requireTargetUser } from "@lib/locals";

function assertTargetTeamHasNotInvitedTargetUser(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const targetTeam = requireTargetTeam(res);
    const targetUser = requireTargetUser(res);

    assertTargetTeamHasNotInvitedUser({
      teamId: targetTeam.id,
      targetUserId: targetUser.id,
    });
    next();
  } catch (error) {
    next(error);
  }
}

export default assertTargetTeamHasNotInvitedTargetUser;
