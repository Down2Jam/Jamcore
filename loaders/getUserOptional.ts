import type { NextFunction, Request, Response } from "express";

import { loadOptionalRequestUserBySlug } from "../features/users/index.js";

async function getUserOptional(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userSlug } = res.locals;

  if (!userSlug) {
    next();
    return;
  }

  const user = await loadOptionalRequestUserBySlug(userSlug, res.locals.tenantId);
  if (user) {
    res.locals.user = user;
  }

  next();
}

export default getUserOptional;
