import express from "express";
import db from "@helper/db";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "@helper/contentModeration";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const jamIdParam = (req.query.jamId as string | undefined)?.trim();
    const sort = (req.query.sort as string | undefined)?.trim() ?? "random";

    if (
      jamIdParam &&
      jamIdParam !== "all" &&
      Number.isNaN(Number(jamIdParam))
    ) {
      return res.status(400).json({ message: "Invalid jamId" });
    }

    const where = {
      game: {
        published: true,
        ...(jamIdParam && jamIdParam !== "all"
          ? { jamId: Number(jamIdParam) }
          : {}),
      },
    };

    let orderBy: {} | undefined = { id: "desc" };
    switch (sort) {
      case "random":
      case "leastratings":
      case "danger":
      case "ratingbalance":
      case "karma":
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

    let tracks = await db.track.findMany({
      where,
      include: {
        composer: true,
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
                            game: {
                              select: {
                                jamId: true,
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

    if (sort === "ratingbalance" || sort === "karma") {
      const ratingsGiven = (track: (typeof tracks)[number]) =>
        track.game.team.users.reduce(
          (sum, user) =>
            sum +
            user.trackRatings.reduce(
              (inner, rating) =>
                inner +
                (rating.track?.game.jamId === track.game.jamId
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
          (a, b) => ratingsGiven(b) - ratingsGotten(b) - (ratingsGiven(a) - ratingsGotten(a)),
        );
      }

      if (sort === "karma") {
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
                    comment.track?.game.jamId === track.game.jamId,
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

          const exponent = 0.73412;
          const ratingScore = given ^ exponent;
          const heartScore = likes ^ exponent;

          return ratingScore + heartScore - gotten;
        };

        tracks = tracks.sort((a, b) => karmaScore(b) - karmaScore(a));
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
      const track = await db.track.findUnique({
        where: { slug: trackSlug },
        include: {
          composer: true,
          game: {
            include: {
              team: {
                include: {
                  users: true,
                  owner: true,
                },
              },
              jam: true,
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
              children: {
                include: {
                  author: true,
                  likes: true,
                  children: {
                    include: {
                      author: true,
                      likes: true,
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

      if (!track || !track.game?.published) {
        return res.status(404).json({ message: "Track not found" });
      }

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
        }
      > = {};

      const jamTracks = await db.track.findMany({
        where: {
          game: {
            jamId: track.game.jamId,
            published: true,
          },
        },
        include: {
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

      const trackWithScores = jamTracks.map((candidate) => {
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
                candidateGame.jamId === track.game.jamId &&
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
        };
      });

      const rankedTracks = trackWithScores.filter((candidate) => {
        const overallCategory = candidate.categoryAverages.find(
          (avg) => avg.categoryName === "Overall",
        );
        return overallCategory && overallCategory.rankedRatingCount >= 5;
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

      const target = trackWithScores.find((candidate) => candidate.id === track.id);
      if (target) {
        target.categoryAverages.forEach((category) => {
          scores[category.categoryName] = {
            placement: category.rankedRatingCount >= 5 ? category.placement : -1,
            averageScore: category.averageScore,
            averageUnrankedScore: category.averageUnrankedScore,
            ratingCount: category.ratingCount,
            rankedRatingCount: category.rankedRatingCount,
          };
        });
      }

      return res.json({
        ...track,
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
