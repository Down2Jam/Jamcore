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
    const { category, contentType, sort, jam } = req.query;

    let where = {
      category: category as GameCategory,
    };

    if (jam !== "all") {
      where.jamId = parseInt(jam as string);
    }

    if (
      res.locals.jam &&
      new Date(
        new Date(res.locals.startTime).getTime() +
          res.locals.jammingHours * 60 * 60 * 1000 +
          res.locals.submissionHours * 60 * 60 * 1000 +
          res.locals.ratingHours * 60 * 60 * 1000
      ).getTime() > Date.now() &&
      (!res.locals.user || res.locals.user.id !== 3)
    ) {
      return { data: [] };
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

    let filteredGames = games
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
        categories = categories.filter(
          (category) =>
            game.ratings
              .filter((rating) =>
                categories
                  .map((ratingCategory) => ratingCategory.id)
                  .includes(rating.categoryId)
              )
              .filter(
                (rating) =>
                  rating.categoryId === category.id &&
                  rating.user.teams.filter((team) => team.game?.published)
                    .length > 0
              ).length >= 5
        );
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
      })
      .filter((game) => {
        const overallCategory = game.categoryAverages.find(
          (avg) => avg.categoryName === "RatingCategory.Overall.Title"
        );
        return overallCategory && overallCategory.ratingCount >= 5;
      })
      .filter((game) => game.ratingsCount >= 4.99);

    filteredGames.forEach((game) => {
      game.categoryAverages.forEach((category) => {
        // Rank games within each category by averageScore
        const rankedGamesInCategory = filteredGames
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

    filteredGames.sort((a, b) => {
      const aOverall =
        a.categoryAverages.find(
          (avg) =>
            avg.categoryName ===
            (sort == "OVERALL"
              ? "RatingCategory.Overall.Title"
              : sort == "GAMEPLAY"
              ? "RatingCategory.Gameplay.Title"
              : sort == "AUDIO"
              ? "RatingCategory.Audio.Title"
              : sort == "GRAPHICS"
              ? "RatingCategory.Graphics.Title"
              : sort == "CREATIVITY"
              ? "RatingCategory.Creativity.Title"
              : sort == "EMOTIONALDELIVERY"
              ? "RatingCategory.Emotional.Title"
              : "RatingCategory.Theme.Title")
        )?.averageScore || 0;

      const bOverall =
        b.categoryAverages.find(
          (avg) =>
            avg.categoryName ===
            (sort == "OVERALL"
              ? "RatingCategory.Overall.Title"
              : sort == "GAMEPLAY"
              ? "RatingCategory.Gameplay.Title"
              : sort == "AUDIO"
              ? "RatingCategory.Audio.Title"
              : sort == "GRAPHICS"
              ? "RatingCategory.Graphics.Title"
              : sort == "CREATIVITY"
              ? "RatingCategory.Creativity.Title"
              : sort == "EMOTIONALDELIVERY"
              ? "RatingCategory.Emotional.Title"
              : "RatingCategory.Theme.Title")
        )?.averageScore || 0;

      return bOverall - aOverall;
    });

    filteredGames = filteredGames.filter((game) => {
      const overallCategory = game.categoryAverages.find(
        (avg) =>
          avg.categoryName ===
          (sort == "OVERALL"
            ? "RatingCategory.Overall.Title"
            : sort == "GAMEPLAY"
            ? "RatingCategory.Gameplay.Title"
            : sort == "AUDIO"
            ? "RatingCategory.Audio.Title"
            : sort == "GRAPHICS"
            ? "RatingCategory.Graphics.Title"
            : sort == "CREATIVITY"
            ? "RatingCategory.Creativity.Title"
            : sort == "EMOTIONALDELIVERY"
            ? "RatingCategory.Emotional.Title"
            : "RatingCategory.Theme.Title")
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    });

    res.json({ data: filteredGames });
  }
);

export default router;
