import { Request, Response, NextFunction } from "express";
import db from "../helper/db";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "../helper/recommendations";

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

  const overallGameCategory = await db.ratingCategory.findFirst({
    where: { name: "RatingCategory.Overall.Title" },
    select: { id: true },
  });
  const overallTrackCategory = await db.trackRatingCategory.findFirst({
    where: { name: "Overall" },
    select: { id: true },
  });
  const activeJam = await db.jam.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const activeJamId = activeJam?.id ?? null;

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
        hideRatings: true,
        autoHideRatingsWhileStreaming: true,
        jams: true,
        bannerPicture: true,
        pronouns: true,
        links: true,
        linkLabels: true,
        recommendedGameOverrideIds: true,
        recommendedGameHiddenIds: true,
        recommendedTrackOverrideIds: true,
        recommendedTrackHiddenIds: true,
        ratings: {
          select: {
            gameId: true,
            categoryId: true,
            value: true,
            userId: true,
            updatedAt: true,
            game: {
              select: {
                jamId: true,
                ratingCategories: { select: { id: true } },
              },
            },
          },
        },
        trackRatings: {
          select: {
            trackId: true,
            categoryId: true,
            value: true,
            userId: true,
            updatedAt: true,
            track: {
              select: {
                game: {
                  select: {
                    jamId: true,
                  },
                },
              },
            },
          },
        },
        recommendedPosts: {
          select: {
            id: true,
            title: true,
            slug: true,
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
            jamId: true,
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
        hideRatings: true,
        autoHideRatingsWhileStreaming: true,
        jams: true,
        bannerPicture: true,
        pronouns: true,
        links: true,
        linkLabels: true,
        recommendedGameOverrideIds: true,
        recommendedGameHiddenIds: true,
        recommendedTrackOverrideIds: true,
        recommendedTrackHiddenIds: true,
        ratings: {
          select: {
            gameId: true,
            categoryId: true,
            value: true,
            userId: true,
            updatedAt: true,
            game: {
              select: {
                jamId: true,
                ratingCategories: { select: { id: true } },
              },
            },
          },
        },
        trackRatings: {
          select: {
            trackId: true,
            categoryId: true,
            value: true,
            userId: true,
            updatedAt: true,
            track: {
              select: {
                game: {
                  select: {
                    jamId: true,
                  },
                },
              },
            },
          },
        },
        recommendedPosts: {
          select: {
            id: true,
            title: true,
            slug: true,
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
            jamId: true,
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

  const gameAverageById = user.ratings.reduce(
    (acc: Map<number, { total: number; count: number }>, rating: any) => {
      if (activeJamId != null && rating.game?.jamId !== activeJamId) return acc;
      const current = acc.get(rating.gameId) ?? { total: 0, count: 0 };
      current.total += rating.value;
      current.count += 1;
      acc.set(rating.gameId, current);
      return acc;
    },
    new Map<number, { total: number; count: number }>(),
  );
  const trackAverageById = (user.trackRatings ?? []).reduce(
    (acc: Map<number, { total: number; count: number }>, rating: any) => {
      if (activeJamId != null && rating.track?.game?.jamId !== activeJamId)
        return acc;
      const current = acc.get(rating.trackId) ?? { total: 0, count: 0 };
      current.total += rating.value;
      current.count += 1;
      acc.set(rating.trackId, current);
      return acc;
    },
    new Map<number, { total: number; count: number }>(),
  );

  const gameRecommendationBase = rankRecommendationCandidates(
  overallGameCategory
      ? user.ratings
          .filter(
            (rating: any) =>
              activeJamId == null || rating.game?.jamId === activeJamId,
          )
          .filter((rating: any) => rating.categoryId === overallGameCategory.id)
          .map((rating: any) => ({
            itemId: rating.gameId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = gameAverageById.get(rating.gameId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          }))
      : [],
  );
  const trackRecommendationBase = rankRecommendationCandidates(
    overallTrackCategory
      ? (user.trackRatings ?? [])
          .filter(
            (rating: any) =>
              activeJamId == null || rating.track?.game?.jamId === activeJamId,
          )
          .filter(
            (rating: any) => rating.categoryId === overallTrackCategory.id,
          )
          .map((rating: any) => ({
            itemId: rating.trackId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = trackAverageById.get(rating.trackId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          }))
      : [],
  );

  const recommendedGameIds = gameRecommendationBase.eligible
    ? applyRecommendationOverrides(
        gameRecommendationBase.candidateIds,
        user.recommendedGameOverrideIds ?? [],
        user.recommendedGameHiddenIds ?? [],
      )
    : [];
  const recommendedTrackIds = trackRecommendationBase.eligible
    ? applyRecommendationOverrides(
        trackRecommendationBase.candidateIds,
        user.recommendedTrackOverrideIds ?? [],
        user.recommendedTrackHiddenIds ?? [],
      )
    : [];

  const [gameCandidates, recommendedGames, trackCandidates, recommendedTracks] =
    await Promise.all([
      gameRecommendationBase.candidateIds.length > 0
        ? db.game.findMany({
            where: { id: { in: gameRecommendationBase.candidateIds } },
            select: {
              id: true,
              name: true,
              slug: true,
              short: true,
              thumbnail: true,
              itchEmbedUrl: true,
              category: true,
              downloadLinks: {
                select: {
                  id: true,
                  url: true,
                  platform: true,
                },
              },
              jam: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      recommendedGameIds.length > 0
        ? db.game.findMany({
            where: { id: { in: recommendedGameIds } },
            select: {
              id: true,
              name: true,
              slug: true,
              short: true,
              thumbnail: true,
              itchEmbedUrl: true,
              category: true,
              downloadLinks: {
                select: {
                  id: true,
                  url: true,
                  platform: true,
                },
              },
              jam: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      trackRecommendationBase.candidateIds.length > 0
        ? db.track.findMany({
            where: { id: { in: trackRecommendationBase.candidateIds } },
            select: {
              id: true,
              name: true,
              slug: true,
              url: true,
              allowBackgroundUse: true,
              allowBackgroundUseAttribution: true,
              allowDownload: true,
              license: true,
              composer: { select: { name: true, slug: true } },
              game: {
                select: { name: true, slug: true, thumbnail: true, jamId: true },
              },
            },
          })
        : Promise.resolve([]),
      recommendedTrackIds.length > 0
        ? db.track.findMany({
            where: { id: { in: recommendedTrackIds } },
            select: {
              id: true,
              name: true,
              slug: true,
              url: true,
              allowBackgroundUse: true,
              allowBackgroundUseAttribution: true,
              allowDownload: true,
              license: true,
              composer: { select: { name: true, slug: true } },
              game: {
                select: { name: true, slug: true, thumbnail: true, jamId: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

  const sortByIdOrder = <T extends { id: number }>(items: T[], ids: number[]) => {
    const itemById = new Map(items.map((item) => [item.id, item]));
    return ids
      .map((id) => itemById.get(id))
      .filter((item): item is T => Boolean(item));
  };

  res.locals.targetUser = {
    ...user,
    recommendedGames: sortByIdOrder(recommendedGames, recommendedGameIds),
    recommendedTracks: sortByIdOrder(recommendedTracks, recommendedTrackIds),
    recommendedGameCandidates: sortByIdOrder(
      gameCandidates,
      gameRecommendationBase.candidateIds,
    ),
    recommendedTrackCandidates: sortByIdOrder(
      trackCandidates,
      trackRecommendationBase.candidateIds,
    ),
    recommendedGameCandidateCount: gameRecommendationBase.ratedCount,
    recommendedTrackCandidateCount: trackRecommendationBase.ratedCount,
  };
  next();
}

export default getTargetUser;
