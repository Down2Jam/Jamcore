import { Request, Response, NextFunction } from "express";

import { env } from "../config/env.js";
import { ConfigurationError } from "../lib/errors.js";

function assertTokenSecret(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!env.tokenSecret) {
    next(new ConfigurationError("There is no token secret."));
    return;
  }

  next();
}

export default assertTokenSecret;
