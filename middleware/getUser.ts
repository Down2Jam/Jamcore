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
      short: true,
      profilePicture: true,
      createdAt: true,
      slug: true,
      mod: true,
      admin: true,
      jams: true,
      receivedNotifications: {
        include: {
          teamApplication: {
            include: {
              user: true,
              team: true,
            },
          },
          teamInvite: {
            include: {
              user: true,
              team: true,
            },
          },
          comment: {
            include: {
              game: true,
              post: true,
              author: true,
            },
          },
        },
      },
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

  if (!user) {
    res.status(404).send("User missing.");
    return;
  }

  res.locals.user = user;
  next();
}

export default getUser;
