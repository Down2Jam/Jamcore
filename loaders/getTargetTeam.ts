import type { NextFunction, Request, Response } from "express";

import { loadTargetTeamContext } from "@features/teams";

async function getTargetTeam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const targetTeamId =
      req.body?.targetTeamId ?? req.query?.targetTeamId ?? req.params?.teamId;
    res.locals.targetTeam = await loadTargetTeamContext({
      teamId: targetTeamId,
      tenantId: res.locals.tenantId,
    });
    next();
  } catch (error) {
    next(error);
  }
}

export default getTargetTeam;
