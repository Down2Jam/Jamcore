import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

/**
 * Middleware to fetch the target user from the database.
 */
async function getTargetUser(
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
    res.status(502).send("User id or slug missing.");
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
        bio: true,
        short: true,
        profilePicture: true,
        profileBackground: true,
        createdAt: true,
        slug: true,
        mod: true,
        admin: true,
        emotePrefix: true,
        jams: true,
        bannerPicture: true,
        pronouns: true,
        links: true,
        linkLabels: true,
        recommendedGames: {
          select: {
            id: true,
            name: true,
            slug: true,
            thumbnail: true,
          },
        },
        recommendedPosts: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        recommendedTracks: {
          select: {
            id: true,
            name: true,
            url: true,
            composer: { select: { name: true } },
            game: { select: { name: true, slug: true, thumbnail: true } },
          },
        },
        userEmotes: {
          select: {
            id: true,
            slug: true,
            image: true,
            updatedAt: true,
          },
        },
        primaryRoles: true,
        secondaryRoles: true,
        teams: {
          select: {
            game: {
              include: {
                jam: true,
                downloadLinks: true,
              },
            },
          },
        },
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
        profileBackground: true,
        createdAt: true,
        slug: true,
        mod: true,
        admin: true,
        emotePrefix: true,
        jams: true,
        bannerPicture: true,
        pronouns: true,
        links: true,
        linkLabels: true,
        recommendedGames: {
          select: {
            id: true,
            name: true,
            slug: true,
            thumbnail: true,
          },
        },
        recommendedPosts: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
        recommendedTracks: {
          select: {
            id: true,
            name: true,
            url: true,
            composer: { select: { name: true } },
            game: { select: { name: true, slug: true, thumbnail: true } },
          },
        },
        userEmotes: {
          select: {
            id: true,
            slug: true,
            image: true,
            updatedAt: true,
          },
        },
        primaryRoles: true,
        secondaryRoles: true,
        tracks: {
          include: {
            composer: true,
            game: true,
          },
        },
        posts: {
          include: {
            author: true,
          },
        },
        comments: {
          include: {
            author: true,
            likes: true,
            game: true,
            post: true,
            comment: true,
          },
        },
        scores: {
          include: {
            user: true,
            leaderboard: {
              include: {
                game: true,
                scores: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        achievements: {
          include: {
            game: {
              include: {
                achievements: {
                  include: {
                    users: true,
                  },
                },
                leaderboards: {
                  include: {
                    scores: true,
                  },
                },
                ratings: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
            users: true,
          },
        },
        teams: {
          select: {
            game: {
              include: {
                jam: true,
                downloadLinks: true,
              },
            },
          },
        },
      },
    });
  }

  if (!user) {
    res.status(404).send("User missing.");
    return;
  }

  res.locals.targetUser = user;
  next();
}

export default getTargetUser;
