import { Request, Response, NextFunction } from "express";

import { loadTargetUserContext } from "../features/users/index.js";

async function getTargetUserOptional(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const targetUserId =
    req.body?.targetUserId ?? req.query?.targetUserId ?? req.params?.targetUserId;
  const targetUserSlug =
    req.body?.targetUserSlug ?? req.query?.targetUserSlug ?? req.params?.targetUserSlug;

  const userId = targetUserId;
  const userSlug = targetUserSlug;

  if ((!userId || isNaN(parseInt(userId as string))) && !userSlug) {
    next();
    return;
  }

  const user = await loadTargetUserContext({
    targetUserId:
      userId && !isNaN(parseInt(userId as string))
        ? parseInt(userId as string)
        : undefined,
    targetUserSlug: userSlug ? String(userSlug) : undefined,
  });

  if (user) {
    res.locals.targetUser = user;
  }

  next();
}

export default getTargetUserOptional;
