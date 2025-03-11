import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

/**
 * Middleware to fetch the requesting user from the database.
 * Requires authUser to be called previously in the middleware chain.
 */
async function getUser(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { userSlug } = res.locals;

  if (!userSlug) {
    res.status(502).send("User slug missing.");
    return;
  }

  const user = await db.user.findUnique({
    where: {
      slug: userSlug,
    },
    select: {
      id: true,
      name: true,
      bio: true,
      profilePicture: true,
      createdAt: true,
      slug: true,
      mod: true,
      admin: true,
      jams: true,
      bannerPicture: true,
      email: true,
      twitch: true,
    },
  });

  if (!user) {
    res.status(404).send("User missing.");
    return;
  }

  res.locals.user = user;
  next();
}

export default getUser;
