import { Router } from "express";
import rateLimit from "@middleware/rateLimit";

const router = Router();
import { fileURLToPath } from "url";
import { dirname } from "path";
import getJam from "@middleware/getJam";
import db from "@helper/db";
import { GameCategory } from "@prisma/client";

/**
 * Route to get the results
 */
router.get(
  "/",
  rateLimit(),

  getJam,

  async (req, res) => {
    const { category, contentType, sort } = req.query;

    let games = await db.game.findMany({
      where: {
        category: category as GameCategory,
      },
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
          (avg) => avg.categoryName === "Overall"
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
              ? "Overall"
              : sort == "GAMEPLAY"
              ? "Gameplay"
              : sort == "AUDIO"
              ? "Audio"
              : sort == "GRAPHICS"
              ? "Graphics"
              : sort == "CREATIVITY"
              ? "Creativity"
              : sort == "EMOTIONALDELIVERY"
              ? "Emotional Delivery"
              : "Theme")
        )?.averageScore || 0;

      const bOverall =
        b.categoryAverages.find(
          (avg) =>
            avg.categoryName ===
            (sort == "OVERALL"
              ? "Overall"
              : sort == "GAMEPLAY"
              ? "Gameplay"
              : sort == "AUDIO"
              ? "Audio"
              : sort == "GRAPHICS"
              ? "Graphics"
              : sort == "CREATIVITY"
              ? "Creativity"
              : sort == "EMOTIONALDELIVERY"
              ? "Emotional Delivery"
              : "Theme")
        )?.averageScore || 0;

      return bOverall - aOverall;
    });

    filteredGames = filteredGames.filter((game) => {
      const overallCategory = game.categoryAverages.find(
        (avg) =>
          avg.categoryName ===
          (sort == "OVERALL"
            ? "Overall"
            : sort == "GAMEPLAY"
            ? "Gameplay"
            : sort == "AUDIO"
            ? "Audio"
            : sort == "GRAPHICS"
            ? "Graphics"
            : sort == "CREATIVITY"
            ? "Creativity"
            : sort == "EMOTIONALDELIVERY"
            ? "Emotional Delivery"
            : "Theme")
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    });

    res.json({ data: filteredGames });
  }
);

export default router;
