import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

/**
 * Middleware to fetch the target user from the database (if wanted).
 */
async function getTargetUserOptional(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const targetUserId =
    req.body?.targetUserId ??
    req.query?.targetUserId ??
    req.params?.targetUserId;
  const targetUserSlug =
    req.body?.targetUserSlug ??
    req.query?.targetUserSlug ??
    req.params?.targetUserSlug;

  const userId = targetUserId;
  const userSlug = targetUserSlug;

  if ((!userId || isNaN(parseInt(userId as string))) && !userSlug) {
    next();
    return;
  }

  let user;

  if (userId && !isNaN(parseInt(userId as string))) {
    let idnumber = parseInt(userId as string);

    user = await db.user.findUnique({
      where: {
        id: idnumber,
      },
      select: {
        id: true,
        name: true,
        short: true,
        bio: true,
        profilePicture: true,
        createdAt: true,
        slug: true,
        mod: true,
        admin: true,
        jams: true,
        bannerPicture: true,
        primaryRoles: true,
        secondaryRoles: true,
      },
    });
  } else {
    user = await db.user.findUnique({
      where: {
        slug: userSlug as string,
      },
      select: {
        id: true,
        name: true,
        bio: true,
        short: true,
        profilePicture: true,
        createdAt: true,
        slug: true,
        mod: true,
        admin: true,
        jams: true,
        bannerPicture: true,
        primaryRoles: true,
        secondaryRoles: true,
      },
    });
  }

  if (user) {
    res.locals.targetUser = user;
  }

  next();
}

export default getTargetUserOptional;
