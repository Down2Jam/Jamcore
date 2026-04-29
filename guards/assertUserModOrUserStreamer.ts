import { Request, Response, NextFunction } from "express";

import { canUseStreamerTools } from "../domain/userPolicies.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserModOrUserStreamer(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!canUseStreamerTools(res.locals.user)) {
    next(new ForbiddenError("Requesting user is not a mod and not a streamer."));
    return;
  }

  next();
}

export default assertUserModOrUserStreamer;
