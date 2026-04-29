import type { NextFunction, Request, Response } from "express";

import { assertTargetTeamApplicationsOpen as assertTargetTeamApplicationsOpenState } from "@features/teams";

function assertTeamApplicationsOpen(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    assertTargetTeamApplicationsOpenState(res.locals.targetTeam);
    next();
  } catch (error) {
    next(error);
  }
}

export default assertTeamApplicationsOpen;
