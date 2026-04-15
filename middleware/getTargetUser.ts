import { Request, Response, NextFunction } from "express";
import db from "../helper/db";
import { materializeGamePage } from "@helper/gamePages";
import { materializeTrackPage } from "@helper/trackPages";
import { PageVersion } from "@prisma/client";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "../helper/recommendations";

function getRatingPageVersion(rating: any): PageVersion {
  return rating?.gamePage?.version === PageVersion.POST_JAM
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

function materializeGameSummaryForVersion(game: any, version: PageVersion) {
  return materializeGamePage(
    {
      ...game,
      downloadLinks: game?.downloadLinks ?? [],
      pages: game?.pages ?? [],
    },
    version,
  );
}

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
            gamePage: {
              select: {
                version: true,
              },
            },
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
                gamePage: {
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
                pages: {
                  where: {
                    version: {
                      in: [PageVersion.JAM, PageVersion.POST_JAM],
                    },
                  },
                  include: {
                    downloadLinks: true,
                  },
                },
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
            gamePage: {
              select: {
                version: true,
              },
            },
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
                gamePage: {
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
        gamePageTracks: {
          include: {
            composer: true,
            gamePage: {
              include: {
                game: {
                  include: {
                    jam: true,
                    pages: true,
                  },
                },
              },
            },
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
                gamePage: {
                  include: {
                    game: {
                      include: {
                        pages: {
                          include: {
                            achievements: {
                              include: {
                                users: true,
                              },
                            },
                            leaderboards: true,
                            downloadLinks: true,
                          },
                        },
                      },
                    },
                  },
                },
                scores: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        gamePageAchievements: {
          include: {
            gamePage: {
              include: {
                game: {
                  include: {
                    pages: {
                      include: {
                        achievements: {
                          include: {
                            users: true,
                          },
                        },
                        leaderboards: true,
                        downloadLinks: true,
                      },
                    },
                    ratings: {
                      select: {
                        userId: true,
                      },
                    },
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
                pages: {
                  where: {
                    version: {
                      in: [PageVersion.JAM, PageVersion.POST_JAM],
                    },
                  },
                  include: {
                    downloadLinks: true,
                  },
                },
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

  user = {
    ...user,
    ratings: (user.ratings ?? []).map((rating: any) => ({
      ...rating,
      pageVersion: getRatingPageVersion(rating),
    })),
  };

  const gameAverageById = user.ratings.reduce(
    (acc: Map<number, { total: number; count: number }>, rating: any) => {
      if (activeJamId != null && rating.game?.jamId !== activeJamId) return acc;
      if (rating.pageVersion !== PageVersion.JAM) return acc;
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
      if (activeJamId != null && rating.track?.gamePage?.game?.jamId !== activeJamId)
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
          .filter((rating: any) => rating.pageVersion === PageVersion.JAM)
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
              activeJamId == null || rating.track?.gamePage?.game?.jamId === activeJamId,
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
              slug: true,
              category: true,
              pages: {
                where: { version: "JAM" },
                include: {
                  downloadLinks: true,
                },
                take: 1,
              },
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
              slug: true,
              category: true,
              pages: {
                where: { version: "JAM" },
                include: {
                  downloadLinks: true,
                },
                take: 1,
              },
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
        ? db.gamePageTrack.findMany({
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
              gamePage: {
                select: {
                  version: true,
                  gameId: true,
                  game: {
                    select: {
                      slug: true,
                      jamId: true,
                      pages: {
                        where: { version: "JAM" },
                        select: { name: true, thumbnail: true },
                        take: 1,
                      },
                    },
                  },
                }
              },
            },
          })
        : Promise.resolve([]),
      recommendedTrackIds.length > 0
        ? db.gamePageTrack.findMany({
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
              gamePage: {
                select: {
                  version: true,
                  gameId: true,
                  game: {
                    select: {
                      slug: true,
                      jamId: true,
                      pages: {
                        where: { version: "JAM" },
                        select: { name: true, thumbnail: true },
                        take: 1,
                      },
                    },
                  },
                }
              },
            },
          })
        : Promise.resolve([]),
    ]);

  const ownedGameIds = (user.teams ?? [])
    .map((team: any) => team.game?.id)
    .filter((id: unknown): id is number => Number.isInteger(id));
  const ownedTrackIds = (user.gamePageTracks ?? [])
    .map((track: any) => track.id)
    .filter((id: unknown): id is number => Number.isInteger(id));

  const recommendationUsers =
    ownedGameIds.length > 0 || ownedTrackIds.length > 0
      ? await db.user.findMany({
          where: {
            id: { not: user.id },
          },
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
            recommendedGameOverrideIds: true,
            recommendedGameHiddenIds: true,
            recommendedTrackOverrideIds: true,
            recommendedTrackHiddenIds: true,
            ratings: {
              where:
                activeJamId != null
                  ? {
                      game: {
                        jamId: activeJamId,
                      },
                    }
                  : undefined,
              select: {
                gameId: true,
                categoryId: true,
                value: true,
                updatedAt: true,
                gamePage: {
                  select: {
                    version: true,
                  },
                },
              },
            },
            trackRatings: {
              where:
                activeJamId != null
                  ? {
                      track: {
                        gamePage: {
                          game: {
                            jamId: activeJamId,
                          },
                        },
                      },
                    }
                  : undefined,
              select: {
                trackId: true,
                categoryId: true,
                value: true,
                updatedAt: true,
              },
            },
          },
        })
      : [];

  const favoriteGameCountMap = new Map(
    ownedGameIds.map((gameId) => [
      gameId,
      {
        count: 0,
        users: [] as Array<{
          id: number;
          slug: string;
          name: string;
          profilePicture: string | null;
        }>,
      },
    ]),
  );
  const favoriteTrackCountMap = new Map(
    ownedTrackIds.map((trackId) => [
      trackId,
      {
        count: 0,
        users: [] as Array<{
          id: number;
          slug: string;
          name: string;
          profilePicture: string | null;
        }>,
      },
    ]),
  );

  recommendationUsers.forEach((recommendationUser) => {
    if (overallGameCategory) {
      const jamRatings = recommendationUser.ratings
        .map((rating: any) => ({
          ...rating,
          pageVersion: getRatingPageVersion(rating),
        }))
        .filter((rating: any) => rating.pageVersion === PageVersion.JAM);

      const gameAverageById = jamRatings.reduce(
        (acc: Map<number, { total: number; count: number }>, rating: any) => {
          const current = acc.get(rating.gameId) ?? { total: 0, count: 0 };
          current.total += rating.value;
          current.count += 1;
          acc.set(rating.gameId, current);
          return acc;
        },
        new Map<number, { total: number; count: number }>(),
      );

      const gameRecommendationBase = rankRecommendationCandidates(
        jamRatings
          .filter((rating: any) => rating.categoryId === overallGameCategory.id)
          .map((rating: any) => ({
            itemId: rating.gameId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = gameAverageById.get(rating.gameId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          })),
      );

      const effectiveGameIds = gameRecommendationBase.eligible
        ? applyRecommendationOverrides(
            gameRecommendationBase.candidateIds,
            recommendationUser.recommendedGameOverrideIds ?? [],
            recommendationUser.recommendedGameHiddenIds ?? [],
          )
        : [];

      effectiveGameIds.forEach((gameId) => {
        if (favoriteGameCountMap.has(gameId)) {
          const current = favoriteGameCountMap.get(gameId);
          if (!current) return;
          current.count += 1;
          if (current.users.length < 5) {
            current.users.push({
              id: recommendationUser.id,
              slug: recommendationUser.slug,
              name: recommendationUser.name,
              profilePicture: recommendationUser.profilePicture,
            });
          }
        }
      });
    }

    if (overallTrackCategory) {
      const trackAverageById = (recommendationUser.trackRatings ?? []).reduce(
        (acc: Map<number, { total: number; count: number }>, rating: any) => {
          const current = acc.get(rating.trackId) ?? { total: 0, count: 0 };
          current.total += rating.value;
          current.count += 1;
          acc.set(rating.trackId, current);
          return acc;
        },
        new Map<number, { total: number; count: number }>(),
      );

      const trackRecommendationBase = rankRecommendationCandidates(
        (recommendationUser.trackRatings ?? [])
          .filter((rating: any) => rating.categoryId === overallTrackCategory.id)
          .map((rating: any) => ({
            itemId: rating.trackId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = trackAverageById.get(rating.trackId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          })),
      );

      const effectiveTrackIds = trackRecommendationBase.eligible
        ? applyRecommendationOverrides(
            trackRecommendationBase.candidateIds,
            recommendationUser.recommendedTrackOverrideIds ?? [],
            recommendationUser.recommendedTrackHiddenIds ?? [],
          )
        : [];

      effectiveTrackIds.forEach((trackId) => {
        if (favoriteTrackCountMap.has(trackId)) {
          const current = favoriteTrackCountMap.get(trackId);
          if (!current) return;
          current.count += 1;
          if (current.users.length < 5) {
            current.users.push({
              id: recommendationUser.id,
              slug: recommendationUser.slug,
              name: recommendationUser.name,
              profilePicture: recommendationUser.profilePicture,
            });
          }
        }
      });
    }
  });

  const favoriteGameCounts = [...favoriteGameCountMap.entries()].map(
    ([gameId, value]) => ({
      gameId,
      count: value.count,
      users: value.users,
    }),
  );
  const favoriteTrackCounts = [...favoriteTrackCountMap.entries()].map(
    ([trackId, value]) => ({
      trackId,
      count: value.count,
      users: value.users,
    }),
  );

  const sortByIdOrder = <T extends { id: number }>(items: T[], ids: number[]) => {
    const itemById = new Map(items.map((item) => [item.id, item]));
    return ids
      .map((id) => itemById.get(id))
      .filter((item): item is T => Boolean(item));
  };

  const materializeJamGameSummary = (game: any) =>
    materializeGameSummaryForVersion(game, PageVersion.JAM);

  const materializeTrackGameSummary = (track: any) => materializeTrackPage(track);

  const normalizedScores = (user.scores ?? []).map((score: any) => ({
    ...score,
    leaderboard: score.leaderboard
      ? {
          ...score.leaderboard,
          game: score.leaderboard.gamePage?.game
            ? materializeGameSummaryForVersion(
                score.leaderboard.gamePage.game,
                score.leaderboard.gamePage.version === PageVersion.POST_JAM
                  ? PageVersion.POST_JAM
                  : PageVersion.JAM,
              )
            : null,
        }
      : null,
  }));

  const normalizedAchievements = (user.gamePageAchievements ?? []).map(
    (achievement: any) => {
      const pageVersion =
        achievement.gamePage?.version === PageVersion.POST_JAM
          ? PageVersion.POST_JAM
          : PageVersion.JAM;
      const pageGame = achievement.gamePage?.game ?? null;
      const game = pageGame
        ? materializeGameSummaryForVersion(pageGame, pageVersion)
        : null;
      const pageRecord =
        pageGame?.pages?.find((page: any) => page.version === pageVersion) ??
        null;
      const fullAchievement =
        pageRecord?.achievements?.find((entry: any) => entry.id === achievement.id) ??
        achievement;

      return {
        ...achievement,
        ...fullAchievement,
        game,
        pageVersion,
      };
    },
  );

  const normalizedTeams = (user.teams ?? []).map((team: any) => ({
    ...team,
    game: team.game ? materializeGameSummaryForVersion(team.game, PageVersion.JAM) : null,
  }));

  res.locals.targetUser = {
    ...user,
    teams: normalizedTeams,
    tracks: (user.gamePageTracks ?? []).map(materializeTrackPage),
    scores: normalizedScores,
    achievements: normalizedAchievements,
    recommendedGames: sortByIdOrder(recommendedGames, recommendedGameIds).map(
      materializeJamGameSummary,
    ),
    recommendedTracks: sortByIdOrder(
      recommendedTracks,
      recommendedTrackIds,
    ).map(materializeTrackGameSummary),
    recommendedGameCandidates: sortByIdOrder(
      gameCandidates,
      gameRecommendationBase.candidateIds,
    ).map(materializeJamGameSummary),
    recommendedTrackCandidates: sortByIdOrder(
      trackCandidates,
      trackRecommendationBase.candidateIds,
    ).map(materializeTrackGameSummary),
    recommendedGameCandidateCount: gameRecommendationBase.ratedCount,
    recommendedTrackCandidateCount: trackRecommendationBase.ratedCount,
    favoriteGameCounts,
    favoriteTrackCounts,
  };
  next();
}

export default getTargetUser;
