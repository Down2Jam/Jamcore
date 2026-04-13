import { Router } from "express";
import rateLimit from "@middleware/rateLimit";

const router = Router();
import { fileURLToPath } from "url";
import { dirname } from "path";
import getJam from "@middleware/getJam";
import db from "@helper/db";
import { GameCategory } from "@prisma/client";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";
import { PageVersion } from "@prisma/client";
import { materializeTrackPage } from "@helper/trackPages";

const gameSortCategoryName = (sort?: string | string[]) => {
  switch (sort) {
    case "GAMEPLAY":
      return "RatingCategory.Gameplay.Title";
    case "AUDIO":
      return "RatingCategory.Audio.Title";
    case "GRAPHICS":
      return "RatingCategory.Graphics.Title";
    case "CREATIVITY":
      return "RatingCategory.Creativity.Title";
    case "EMOTIONALDELIVERY":
      return "RatingCategory.Emotional.Title";
    case "THEME":
      return "RatingCategory.Theme.Title";
    case "OVERALL":
    default:
      return "RatingCategory.Overall.Title";
  }
};

/**
 * Route to get the results
 */
router.get(
  "/",
  rateLimit(),

  authUserOptional,
  getUserOptional,
  getJam,

  async (req, res) => {
    const { category, contentType, sort, jam, preview, recap } = req.query;

    if (res.locals?.jam && res.locals?.jam.id == jam) {
      const startMs = new Date(res.locals.jam.startTime).getTime();
      const jammingMs = (res.locals.jam.jammingHours ?? 0) * 60 * 60 * 1000;
      const submissionMs =
        (res.locals.jam.submissionHours ?? 0) * 60 * 60 * 1000;
      const ratingMs = (res.locals.jam.ratingHours ?? 0) * 60 * 60 * 1000;

      const endTs = startMs + jammingMs + submissionMs + ratingMs;
      const isOver = Date.now() >= endTs;
      const canPreviewResults =
        preview === "1" && Boolean(res.locals.user?.admin);
      const canViewRecapResults = recap === "1";

      if (!isOver && !canPreviewResults && !canViewRecapResults) {
        return res.json({ data: [] });
      }
    }

    if (contentType === "MUSIC") {
      if (jam === "all") {
        return res.json({ data: [] });
      }

      const jamId = parseInt(jam as string);
      const trackCategory =
        category === "REGULAR" || category === "ODA"
          ? (category as GameCategory)
          : undefined;
      const tracks = await db.gamePageTrack.findMany({
        where: {
          gamePage: {
            version: PageVersion.JAM,
            game: {
              jamId,
              published: true,
              ...(trackCategory ? { category: trackCategory } : {}),
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
                    select: {
                      users: {
                        select: {
                          trackRatings: {
                            select: {
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
                },
              },
            },
          },
          ratings: {
            select: {
              value: true,
              categoryId: true,
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

      const computedTracks = tracks
        .map((track) => {
          const materializedTrack = materializeTrackPage(track);
          const categoryAverages = trackCategories.map((category) => {
            const categoryRatings = track.ratings.filter(
              (rating) => rating.categoryId === category.id,
            );
            const rankedRatings = categoryRatings.filter((rating) =>
              rating.user.teams.some((team) => {
                const candidateGame = team.game;
                return (
                  candidateGame &&
                  candidateGame.published &&
                  candidateGame.jamId === jamId &&
                  candidateGame.category !== "EXTRA"
                );
              }),
            );

            const averageUnrankedScore =
              categoryRatings.length > 0
                ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
                  categoryRatings.length
                : 0;

            const averageScore =
              rankedRatings.length > 0
                ? rankedRatings.reduce((sum, rating) => sum + rating.value, 0) /
                  rankedRatings.length
                : 0;

            return {
              categoryId: category.id,
              categoryName: category.name,
              averageScore,
              averageUnrankedScore,
              ratingCount: categoryRatings.length,
              rankedRatingCount: rankedRatings.length,
              placement: -1,
            };
          });

          return {
            ...materializedTrack,
            categoryAverages,
            ratingsCount: track.gamePage.game.team.users.reduce((totalRatings, user) => {
              const userRatingCount = user.trackRatings.reduce(
                (count, rating) =>
                  count +
                  (rating.track?.gamePage?.game?.jamId === jamId
                    ? 1 / trackCategories.length
                    : 0),
                0,
              );
              return totalRatings + userRatingCount;
            }, 0),
          };
        })
        .filter((track) => track.game.category !== "EXTRA");

      const qualifiedTracks = computedTracks
        .filter((track) => {
          const overall = track.categoryAverages.find(
            (avg) => avg.categoryName === "Overall",
          );
          return (
            track.game.category !== "EXTRA" &&
            overall &&
            overall.rankedRatingCount >= 5
          );
        })
        .filter((track) => track.ratingsCount >= 4.99);

      qualifiedTracks.forEach((track) => {
        track.categoryAverages.forEach((category) => {
          const rankedTracks = qualifiedTracks
            .map((candidate) => ({
              trackId: candidate.id,
              score:
                candidate.categoryAverages.find(
                  (avg) => avg.categoryId === category.categoryId,
                )?.averageScore ?? 0,
            }))
            .sort((a, b) => b.score - a.score);

          const placement = rankedTracks.findIndex(
            (candidate) => candidate.trackId === track.id,
          );
          category.placement = placement + 1;
        });
      });

      qualifiedTracks.sort((a, b) => {
        const aOverall =
          a.categoryAverages.find((avg) => avg.categoryName === "Overall")
            ?.averageScore ?? 0;
        const bOverall =
          b.categoryAverages.find((avg) => avg.categoryName === "Overall")
            ?.averageScore ?? 0;
        return bOverall - aOverall;
      });

      return res.json({ data: qualifiedTracks });
    }

    let where = {
      category: category as GameCategory,
    };

    if (jam && jam !== "all") {
      where.jamId = parseInt(jam as string);
    }

    if (jam === "all") {
      return res.json({ data: [] }); // temp
    }

    let games = await db.game.findMany({
      where,
      include: {
        majRatingCategories: true,
        ratingCategories: true,
        team: {
          select: {
            users: {
              select: {
                ratings: {
                  select: {
                    game: {
                      select: {
                        ratingCategories: {
                          select: {
                            id: true,
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
          select: {
            value: true,
            categoryId: true,
            user: {
              select: {
                teams: {
                  select: {
                    game: {
                      select: {
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

    const ratingCategories = await db.ratingCategory.findMany({
      where: {
        always: true,
      },
    });

    const computedGames = games
      .map((game) => {
        let categories = [...game.ratingCategories, ...ratingCategories];
        if (contentType == "MAJORITYCONTENT" && game.category == "REGULAR") {
          categories = categories.filter(
            (category) =>
              !category.askMajorityContent ||
              game.majRatingCategories
                .map((cat) => cat.id)
                .includes(category.id)
          );
        }
        const categoryIds = categories.map(
          (ratingCategory) => ratingCategory.id
        );

        // Filter out ratings in categories the game has opted out of (in case they opt out later)
        const filteredRatings = game.ratings.filter((rating) =>
          categoryIds.includes(rating.categoryId)
        );

        const categoryAverages = categories.map((category) => {
          const categoryRatings = filteredRatings.filter(
            (rating) =>
              rating.categoryId === category.id &&
              rating.user.teams.filter((team) => team.game?.published).length >
                0
          );

          const averageRating =
            categoryRatings.length > 0
              ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
                categoryRatings.length
              : 0;

          return {
            categoryId: category.id,
            categoryName: category.name,
            averageScore: averageRating,
            ratingCount: categoryRatings.length,
            placement: -1,
          };
        });

        return {
          ...game,
          categoryAverages,
          ratingsCount: game.team.users.reduce((totalRatings, user) => {
            const userRatingCount = user.ratings.reduce((count, rating) => {
              return (
                count +
                1 /
                  (rating.game.ratingCategories.length +
                    ratingCategories.length)
              );
            }, 0);
            return totalRatings + userRatingCount;
          }, 0),
        };
      });

    const qualifiedGames = computedGames
      .filter((game) => {
        const overallCategory = game.categoryAverages.find(
          (avg) => avg.categoryName === "RatingCategory.Overall.Title"
        );
        return overallCategory && overallCategory.ratingCount >= 5;
      })
      .filter((game) => game.ratingsCount >= 4.99);

    qualifiedGames.forEach((game) => {
      game.categoryAverages.forEach((category) => {
        // Rank games within each category by averageScore
        const rankedGamesInCategory = qualifiedGames
          .map((g) => {
            const categoryAvg = g.categoryAverages.find(
              (cat) => cat.categoryId === category.categoryId
            );
            return {
              gameId: g.id,
              score: categoryAvg ? categoryAvg.averageScore : 0,
            };
          })
          .sort((a, b) => b.score - a.score);

        const gamePlacement = rankedGamesInCategory.findIndex(
          (rankedGame) => rankedGame.gameId === game.id
        );

        category.placement = gamePlacement + 1;
      });
    });

    const sortCategoryName = gameSortCategoryName(sort);

    qualifiedGames.forEach((game) => {
      game.categoryAverages = game.categoryAverages.filter(
        (category) => category.ratingCount >= 5,
      );
    });

    qualifiedGames.sort((a, b) => {
      const aOverall =
        a.categoryAverages.find(
          (avg) => avg.categoryName === sortCategoryName
        )?.averageScore || 0;

      const bOverall =
        b.categoryAverages.find(
          (avg) => avg.categoryName === sortCategoryName
        )?.averageScore || 0;

      return bOverall - aOverall;
    });

    const filteredGames = qualifiedGames.filter((game) => {
      const overallCategory = game.categoryAverages.find(
        (avg) => avg.categoryName === sortCategoryName
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    });

    res.json({ data: filteredGames });
  }
);

export default router;
