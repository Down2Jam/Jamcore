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
          userId: true,
          gamePageId: true,
          categoryId: true,
          gamePage: {
            select: {
              version: true,
              gameId: true,
            },
          },
        },
      },
      trackRatings: {
        select: {
          value: true,
          trackId: true,
          categoryId: true,
        },
      },
      id: true,
      name: true,
      bio: true,
      short: true,
      profilePicture: true,
      profileBackground: true,
      createdAt: true,
      slug: true,
      mod: true,
      admin: true,
      emotePrefix: true,
      hideRatings: true,
      autoHideRatingsWhileStreaming: true,
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
              team: {
                include: {
                  owner: true,
                },
              },
            },
          },
          comment: {
            include: {
              game: true,
              track: true,
              post: true,
              author: true,
              comment: {
                include: {
                  game: true,
                  track: true,
                  post: true,
                  author: true,
                  comment: {
                    include: {
                      game: true,
                      track: true,
                      post: true,
                      author: true,
                    },
                  },
                },
              },
            },
          },
          game: true,
          post: true,
          track: true,
        },
      },
      bannerPicture: true,
      pronouns: true,
      links: true,
      linkLabels: true,
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

  res.locals.user = {
    ...user,
    ratings: (user.ratings ?? []).map((rating) => ({
      ...rating,
      gameId: rating.gamePage?.gameId ?? null,
      pageVersion: rating.gamePage?.version ?? "JAM",
    })),
  };
  next();
}

export default getUser;
