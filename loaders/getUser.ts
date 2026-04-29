import type { NextFunction, Request, Response } from "express";

import { NotFoundError, UnauthorizedError } from "../lib/errors.js";
import { loadRequestUserBySlug } from "../features/users/index.js";

async function getUser(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userSlug } = res.locals;

  if (!userSlug) {
    next(new UnauthorizedError("User slug missing."));
    return;
  }

  const user = await loadRequestUserBySlug(userSlug, res.locals.tenantId);
  if (!user) {
    next(new NotFoundError("User missing."));
    return;
  }

  res.locals.user = user;
  next();
}

export default getUser;
