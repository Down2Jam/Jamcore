import { NextFunction, Response, Request } from "express";

import type { JamPhase } from "../domain/jamTimeline.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertJamPhase(phase: JamPhase) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!res.locals.jamPhase) {
      next(new UnauthorizedError("Jam phase not loaded."));
      return;
    }

    if (res.locals.jamPhase != phase) {
      next(new ForbiddenError(`Jam is not in ${phase} phase.`));
      return;
    }

    next();
  };
}

export default assertJamPhase;
