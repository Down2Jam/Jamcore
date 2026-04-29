import { NextFunction, Response, Request } from "express";

import type { JamPhase } from "../domain/jamTimeline.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertJamPhaseIn(phases: JamPhase[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!res.locals.jamPhase) {
      next(new UnauthorizedError("Jam phase not loaded."));
      return;
    }

    if (!phases.includes(res.locals.jamPhase)) {
      next(new ForbiddenError("Jam is not in the requested phases."));
      return;
    }

    next();
  };
}

export default assertJamPhaseIn;
