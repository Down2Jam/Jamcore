import { Request, Response, NextFunction } from "express";

import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

function assertUserStreamer(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!res.locals.user) {
    next(new UnauthorizedError("User not loaded."));
    return;
  }

  if (!res.locals.user.twitch) {
    next(new ForbiddenError("User is not a streamer."));
    return;
  }

  next();
}

export default assertUserStreamer;
