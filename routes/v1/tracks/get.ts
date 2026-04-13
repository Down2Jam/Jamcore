import express from "express";
import db from "@helper/db";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "@helper/contentModeration";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "@helper/recommendations";
import { materializeTrackPage } from "@helper/trackPages";
import { PageVersion } from "@prisma/client";

const router = express.Router();
const SCORE_SORT_RATING_GOAL = 5;
const SCORE_SORT_MIDPOINT = 6;

type ListingPageVersion = PageVersion | "ALL";

function parseListingPageVersion(value: unknown): ListingPageVersion {
  return value === "POST_JAM" || value === "ALL" ? value : PageVersion.JAM;
}

function parseRequestedPageVersion(value: unknown): PageVersion | undefined {
  if (value === "POST_JAM") return PageVersion.POST_JAM;
  if (value === "JAM") return PageVersion.JAM;
  return undefined;
}

router.get("/", async (req, res) => {
  try {
    const jamIdParam = (req.query.jamId as string | undefined)?.trim();
    const sort = (req.query.sort as string | undefined)?.trim() ?? "random";
    const listingPageVersion = parseListingPageVersion(req.query.pageVersion);

    if (
      jamIdParam &&
      jamIdParam !== "all" &&
      Number.isNaN(Number(jamIdParam))
    ) {
      return res.status(400).json({ message: "Invalid jamId" });
    }

    const where = {
      gamePage: {
        version:
          listingPageVersion === "ALL"
            ? {
                in: [PageVersion.JAM, PageVersion.POST_JAM],
              }
            : listingPageVersion,
        game: {
          published: true,
          ...(jamIdParam && jamIdParam !== "all"
            ? { jamId: Number(jamIdParam) }
            : {}),
        },
      },
    };

    let orderBy: {} | undefined = { id: "desc" };
    switch (sort) {
      case "random":
      case "leastratings":
      case "danger":
      case "score":
      case "ratingbalance":
      case "karma":
      case "recommended":
        orderBy = undefined;
        break;
      case "oldest":
        orderBy = { id: "asc" };
        break;
      case "newest":
        orderBy = { id: "desc" };
        break;
      default:
        orderBy = { id: "desc" };
        break;
    }

    let tracks = await db.gamePageTrack.findMany({
      where,
      include: {
        composer: true,
        gamePage: {
          include: {
            game: {
              include: {
                team: {
                  select: {
                    users: {
                      select: {
                        id: true,
                        comments: {
                          select: {
                            trackId: true,
                            likes: {
                              select: {
                                userId: true,
                                id: true,
                              },
                            },
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
                        trackRatings: {
                          select: {
                            trackId: true,
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
                      },
                    },
                  },
                },
                jam: true,
                pages: {
                  where: {
                    version: {
                      in: [PageVersion.JAM, PageVersion.POST_JAM],
                    },
                  },
                  include: {
                    tracks: {
                      include: {
                        composer: true,
                        tags: {
                          include: {
                            category: true,
                          },
                        },
                        flags: true,
                        links: true,
                        credits: {
                          include: {
                            user: {
                              select: {
                                id: true,
                                slug: true,
                                name: true,
                                profilePicture: true,
                                short: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        flags: true,
        links: true,
        comments: {
          select: {
            id: true,
            likes: {
              select: {
                userId: true,
              },
            },
          },
        },
        ratings: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            user: {
              select: {
                teams: {
                  select: {
                    game: {
                      select: {
                        published: true,
                        jamId: true,
                        category: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        credits: {
          include: {
            user: {
              select: {
                id: true,
                slug: true,
                name: true,
                profilePicture: true,
                short: true,
              },
            },
          },
        },
        tags: {
          include: {
            category: true,
          },
        },
      },
      orderBy,
    });

    if (!tracks) {
      return res.status(404).json({ message: "No tracks found" });
    }

    tracks = tracks.map((track: any) => materializeTrackPage(track));

    const trackCategories = await db.trackRatingCategory.findMany({
      where: {
        always: true,
      },
    });
    const categoryCount = Math.max(trackCategories.length, 1);
    const isAllowedRaterInJam = (
      rating: (typeof tracks)[number]["ratings"][number],
      jamId: number,
    ) =>
      rating.user.teams.some((team) => {
        const candidateGame = team.game;
        return (
          candidateGame &&
          candidateGame.published &&
          candidateGame.jamId === jamId &&
          candidateGame.category !== "EXTRA"
        );
      });

    if (sort === "random") {
      tracks = tracks.sort(() => Math.random() - 0.5);
    }

    if (sort === "score") {
      const getOverallRatings = (track: (typeof tracks)[number]) =>
        track.ratings.filter((rating) => {
          const numericValue = Number(rating.value);
          return (
            rating.category?.name === "Overall" &&
            Number.isFinite(numericValue) &&
            isAllowedRaterInJam(rating, track.game.jamId)
          );
        });

      const getScoreSortAverage = (track: (typeof tracks)[number]) => {
        const overallRatings = getOverallRatings(track);
        if (overallRatings.length === 0) return SCORE_SORT_MIDPOINT;

        return (
          overallRatings.reduce((sum, rating) => sum + Number(rating.value), 0) /
          overallRatings.length
        );
      };

      const getScoreSortAdjusted = (track: (typeof tracks)[number]) => {
        const count = getOverallRatings(track).length;
        const average = getScoreSortAverage(track);
        const weight = Math.min(count, SCORE_SORT_RATING_GOAL) / SCORE_SORT_RATING_GOAL;

        return SCORE_SORT_MIDPOINT + (average - SCORE_SORT_MIDPOINT) * weight;
      };

      const getScoreSortCount = (track: (typeof tracks)[number]) =>
        getOverallRatings(track).length;

      tracks = tracks.sort((a, b) => {
        return (
          getScoreSortAdjusted(b) - getScoreSortAdjusted(a) ||
          getScoreSortAverage(b) - getScoreSortAverage(a) ||
          getScoreSortCount(b) - getScoreSortCount(a) ||
          b.id - a.id
        );
      });
    }

    if (sort === "leastratings") {
      tracks = tracks.sort(
        (a, b) =>
          a.ratings.length / categoryCount - b.ratings.length / categoryCount,
      );
    }

    if (sort === "danger") {
      tracks = tracks
        .filter((track) => track.game.category !== "EXTRA")
        .filter((track) => {
          const allowedCount = track.ratings.filter((rating) =>
            isAllowedRaterInJam(rating, track.game.jamId),
          ).length;
          return allowedCount < 5;
        })
        .sort((a, b) => {
          const allowedA = a.ratings.filter((rating) =>
            isAllowedRaterInJam(rating, a.game.jamId),
          ).length;
          const allowedB = b.ratings.filter((rating) =>
            isAllowedRaterInJam(rating, b.game.jamId),
          ).length;

          return allowedB / categoryCount - allowedA / categoryCount;
        });
    }

    if (
      sort === "ratingbalance" ||
      sort === "karma" ||
      sort === "recommended"
    ) {
      const ratingsGiven = (track: (typeof tracks)[number]) =>
        track.game.team.users.reduce(
          (sum, user) =>
            sum +
            user.trackRatings.reduce(
              (inner, rating) =>
                inner +
                (rating.track?.gamePage?.game?.jamId === track.game.jamId
                  ? 1 / categoryCount
                  : 0),
              0,
            ),
          0,
        );

      const ratingsGotten = (track: (typeof tracks)[number]) =>
        track.ratings.filter((rating) =>
          isAllowedRaterInJam(rating, track.game.jamId),
        ).length / categoryCount;

      if (sort === "ratingbalance") {
        tracks = tracks.sort(
          (a, b) =>
            ratingsGiven(b) -
            ratingsGotten(b) -
            (ratingsGiven(a) - ratingsGotten(a)),
        );
      }

      if (sort === "karma" || sort === "recommended") {
        const exponent = 0.73412;
        const recommendationWeight = 2;
        const recommendationSlots = 3;
        const overallCategoryId =
          trackCategories.find((category) => category.name === "Overall")?.id ??
          null;
        const recommendationKeyFor = (track: (typeof tracks)[number]) =>
          `${track.sourceTrackId ?? track.id}:${track.pageVersion ?? PageVersion.JAM}`;
        const recommendedPointsByTrackId = new Map<string, number>();

        if (overallCategoryId) {
          const ratingsByUser = new Map<
            number,
            Array<{
              trackId: string;
              value: number;
              tieBreakerValue: number;
              updatedAt: number;
            }>
          >();
          const ratingAveragesByUserTrack = new Map<
            number,
            Map<number, { total: number; count: number }>
          >();

          tracks.forEach((candidate) => {
            candidate.ratings.forEach((rating) => {
              if (!isAllowedRaterInJam(rating, candidate.game.jamId)) return;

              const averagesForUser =
                ratingAveragesByUserTrack.get(rating.userId) ?? new Map();
              const aggregate = averagesForUser.get(candidate.id) ?? {
                total: 0,
                count: 0,
              };
              aggregate.total += rating.value;
              aggregate.count += 1;
              averagesForUser.set(candidate.id, aggregate);
              ratingAveragesByUserTrack.set(rating.userId, averagesForUser);
            });
          });

          tracks.forEach((candidate) => {
            candidate.ratings.forEach((rating) => {
              if (!isAllowedRaterInJam(rating, candidate.game.jamId)) return;
              if (rating.categoryId !== overallCategoryId) return;

              const existing = ratingsByUser.get(rating.userId) ?? [];
              const averagesForUser = ratingAveragesByUserTrack.get(
                rating.userId,
              );
              const average = averagesForUser?.get(candidate.id);
              existing.push({
                trackId: recommendationKeyFor(candidate),
                value: rating.value,
                tieBreakerValue: average
                  ? average.total / average.count
                  : rating.value,
                updatedAt: rating.updatedAt.getTime(),
              });
              ratingsByUser.set(rating.userId, existing);
            });
          });

          const recommendationUsers = await db.user.findMany({
            where: { id: { in: [...ratingsByUser.keys()] } },
            select: {
              id: true,
              recommendedTrackOverrideIds: true,
              recommendedTrackHiddenIds: true,
            },
          });
          const recommendationUserMap = new Map(
            recommendationUsers.map((user) => [user.id, user]),
          );

          ratingsByUser.forEach((entries, userId) => {
            const ranking = rankRecommendationCandidates(
              entries.map((entry) => ({
                itemId: entry.trackId,
                value: entry.value,
                tieBreakerValue: entry.tieBreakerValue,
                updatedAt: entry.updatedAt,
              })),
            );
            if (!ranking.eligible) return;

            const recommendationUser = recommendationUserMap.get(userId);
            applyRecommendationOverrides(
              ranking.candidateIds,
              recommendationUser?.recommendedTrackOverrideIds ?? [],
              recommendationUser?.recommendedTrackHiddenIds ?? [],
              recommendationSlots,
            ).forEach((trackId) => {
              const current = recommendedPointsByTrackId.get(trackId) ?? 0;
              recommendedPointsByTrackId.set(trackId, current + 1);
            });
          });
        }

        const karmaScore = (track: (typeof tracks)[number]) => {
          const given = ratingsGiven(track);
          const gotten = ratingsGotten(track);
          const likes = track.game.team.users.reduce(
            (sum, user) =>
              sum +
              user.comments
                .filter(
                  (comment) =>
                    comment.trackId &&
                    comment.trackId !== track.id &&
                    comment.track?.gamePage?.game?.jamId === track.game.jamId,
                )
                .reduce(
                  (inner, comment) =>
                    inner +
                    comment.likes.filter(
                      (like) =>
                        !track.game.team.users.some(
                          (teamUser) => teamUser.id === like.userId,
                        ),
                    ).length,
                  0,
                ),
            0,
          );

          const ratingScore = given ** exponent;
          const heartScore = likes ** exponent;

          return ratingScore + heartScore - gotten;
        };

        const recommendedBoost = (track: (typeof tracks)[number]) => {
          const points = recommendedPointsByTrackId.get(recommendationKeyFor(track)) ?? 0;
          if (points <= 0) return 0;
          return recommendationWeight * points ** exponent;
        };

        tracks = tracks.sort((a, b) => {
          const aScore =
            karmaScore(a) + (sort === "recommended" ? recommendedBoost(a) : 0);
          const bScore =
            karmaScore(b) + (sort === "recommended" ? recommendedBoost(b) : 0);

          return bScore - aScore;
        });
      }
    }

    res.json({
      message:
        jamIdParam && jamIdParam !== "all"
          ? `Fetched tracks for jam ${jamIdParam}`
          : "Fetched tracks",
      data: tracks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch tracks" });
  }
});

router.get(
  "/:trackSlug",
  authUserOptional,
  getUserOptional,
  async (req, res) => {
    try {
      const { trackSlug } = req.params;
      const requestedPageVersion = parseRequestedPageVersion(
        req.query.pageVersion,
      );
      const matchingTracks = await db.gamePageTrack.findMany({
        where: {
          slug: trackSlug,
          gamePage: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
            game: {
              published: true,
            },
          },
        },
        include: {
          composer: true,
          gamePage: {
            include: {
              game: {
                include: {
                  team: {
                    include: {
                      users: true,
                      owner: true,
                    },
                  },
                  jam: true,
                  pages: {
                    where: {
                      version: {
                        in: [PageVersion.JAM, PageVersion.POST_JAM],
                      },
                    },
                    include: {
                      tracks: true,
                    },
                  },
                },
              },
            },
          },
          tags: {
            include: {
              category: true,
            },
          },
          flags: true,
          links: true,
          credits: {
            include: {
              user: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  profilePicture: true,
                  short: true,
                },
              },
            },
          },
          comments: {
            include: {
              author: true,
              likes: true,
              commentReactions: {
                include: {
                  reaction: true,
                  user: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      profilePicture: true,
                    },
                  },
                },
              },
              children: {
                include: {
                  author: true,
                  likes: true,
                  commentReactions: {
                    include: {
                      reaction: true,
                      user: {
                        select: {
                          id: true,
                          slug: true,
                          name: true,
                          profilePicture: true,
                        },
                      },
                    },
                  },
                  children: {
                    include: {
                      author: true,
                      likes: true,
                      commentReactions: {
                        include: {
                          reaction: true,
                          user: {
                            select: {
                              id: true,
                              slug: true,
                              name: true,
                              profilePicture: true,
                            },
                          },
                        },
                      },
                      children: true,
                    },
                  },
                },
              },
            },
          },
          ratings: {
            include: {
              user: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  profilePicture: true,
                  teams: {
                    select: {
                      game: {
                        select: {
                          jamId: true,
                          category: true,
                          published: true,
                        },
                      },
                    },
                  },
                },
              },
              category: true,
            },
          },
          timestampComments: {
            include: {
              author: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  profilePicture: true,
                },
              },
            },
            orderBy: {
              timestamp: "asc",
            },
          },
        },
      });

      const preferredVersions = requestedPageVersion
        ? [requestedPageVersion]
        : [PageVersion.POST_JAM, PageVersion.JAM];
      const track =
        preferredVersions
          .map((version) =>
            matchingTracks.find(
              (candidate) => candidate.gamePage?.version === version,
            ),
          )
          .find(Boolean) ?? null;

      if (!track || !track.gamePage?.game?.published) {
        return res.status(404).json({ message: "Track not found" });
      }

      const materializedTrack = materializeTrackPage(track);
      const scorePageVersion = track.gamePage.version;
      const availablePageVersions = (
        [PageVersion.JAM, PageVersion.POST_JAM] as const
      ).filter((version) =>
        (track.gamePage?.game?.pages ?? []).some(
          (page) =>
            page.version === version &&
            (page.tracks ?? []).some(
              (candidate) => candidate.slug === track.slug,
            ),
        ),
      );

      const visibleComments = mapCommentsForViewer(
        track.comments,
        res.locals.user?.id ?? null,
        isPrivilegedViewer(res.locals.user),
      );

      const viewerRating =
        track.ratings.find((rating) => rating.userId === res.locals.user?.id) ??
        null;

      let scores: Record<
        string,
        {
          placement: number;
          averageScore: number;
          averageUnrankedScore: number;
          ratingCount: number;
          rankedRatingCount: number;
          ratingsGivenCount: number;
        }
      > = {};

      const scoreTracks = await db.gamePageTrack.findMany({
        where: {
          gamePage: {
            version: scorePageVersion,
            game: {
              jamId: materializedTrack.game.jamId,
              published: true,
            },
          },
        },
        include: {
          gamePage: {
            include: {
              game: {
                include: {
                  team: {
                    select: {
                      users: {
                        select: {
                          trackRatings: {
                            select: {
                              track: {
                                select: {
                                  gamePage: {
                                    select: {
                                      version: true,
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
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          ratings: {
            include: {
              category: true,
              user: {
                select: {
                  teams: {
                    select: {
                      game: {
                        select: {
                          jamId: true,
                          category: true,
                          published: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const trackCategories = await db.trackRatingCategory.findMany({
        where: {
          always: true,
        },
      });

      const trackWithScores = scoreTracks.map((candidate) => {
        const categoryAverages = trackCategories.map((category) => {
          const categoryRatings = candidate.ratings.filter(
            (rating) => rating.categoryId === category.id,
          );
          const rankedRatings = categoryRatings.filter((rating) =>
            rating.user.teams.some((team) => {
              const candidateGame = team.game;
              return (
                candidateGame &&
                candidateGame.published &&
                candidateGame.jamId === materializedTrack.game.jamId &&
                candidateGame.category !== "EXTRA"
              );
            }),
          );

          const averageUnrankedScore =
            categoryRatings.length > 0
              ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
                categoryRatings.length
              : 0;

          const averageRankedScore =
            rankedRatings.length > 0
              ? rankedRatings.reduce((sum, rating) => sum + rating.value, 0) /
                rankedRatings.length
              : 0;

          return {
            categoryId: category.id,
            categoryName: category.name,
            averageScore: averageRankedScore,
            averageUnrankedScore,
            ratingCount: categoryRatings.length,
            rankedRatingCount: rankedRatings.length,
            placement: -1,
          };
        });

        return {
          ...candidate,
          categoryAverages,
            ratingsCount: candidate.gamePage.game.team.users.reduce(
              (totalRatings, user) => {
                const userRatingCount = user.trackRatings.reduce(
                  (count, rating) =>
                    count +
                    (rating.track?.gamePage?.game?.jamId ===
                      materializedTrack.game.jamId &&
                    rating.track?.gamePage?.version === scorePageVersion
                      ? 1 / trackCategories.length
                      : 0),
                  0,
                );
              return totalRatings + userRatingCount;
            },
            0,
          ),
        };
      });

      const rankedTracks = trackWithScores.filter((candidate) => {
        const overallCategory = candidate.categoryAverages.find(
          (avg) => avg.categoryName === "Overall",
        );
        return (
          candidate.gamePage.game.category !== "EXTRA" &&
          overallCategory &&
          overallCategory.rankedRatingCount >= 5 &&
          candidate.ratingsCount >= 4.99
        );
      });

      rankedTracks.forEach((candidate) => {
        candidate.categoryAverages.forEach((category) => {
          const rankedInCategory = rankedTracks
            .map((other) => ({
              trackId: other.id,
              score:
                other.categoryAverages.find(
                  (cat) => cat.categoryId === category.categoryId,
                )?.averageScore ?? 0,
            }))
            .sort((a, b) => b.score - a.score);

          const placement = rankedInCategory.findIndex(
            (other) => other.trackId === candidate.id,
          );
          category.placement = placement + 1;
        });
      });

      const target = trackWithScores.find(
        (candidate) => candidate.id === track.id,
      );
      if (target) {
        target.categoryAverages.forEach((category) => {
          const canBeRanked =
            target.gamePage.game.category !== "EXTRA" &&
            category.rankedRatingCount >= 5 &&
            target.ratingsCount >= 4.99;

          scores[category.categoryName] = {
            placement: canBeRanked ? category.placement : -1,
            averageScore: category.averageScore,
            averageUnrankedScore: category.averageUnrankedScore,
            ratingCount: category.ratingCount,
            rankedRatingCount: category.rankedRatingCount,
            ratingsGivenCount: target.ratingsCount,
          };
        });
      }

      return res.json({
        ...materializedTrack,
        availablePageVersions,
        comments: visibleComments,
        viewerRating,
        scores,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch track" });
    }
  },
);

export default router;
