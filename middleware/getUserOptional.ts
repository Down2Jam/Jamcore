import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

/**
 * Middleware to fetch the requesting user from the database.
 * Requires authUser to be called previously in the middleware chain.
 */
async function getUserOptional(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { userSlug } = res.locals;

  if (!userSlug) {
    next();
    return;
  }

  const user = await db.user.findUnique({
    where: {
      slug: userSlug,
    },
    select: {
      ratings: {
        select: {
          value: true,
          gameId: true,
          categoryId: true,
        },
      },
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
      primaryRoles: true,
      secondaryRoles: true,
      teams: {
        include: {
          game: true,
        },
      },
      teamInvites: {
        include: {
          team: {
            include: {
              owner: true,
            },
          },
        },
      },
      ownedTeams: {
        include: {
          applications: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  });

  if (user) {
    res.locals.user = user;
  }

  next();
}

export default getUserOptional;
