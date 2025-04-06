import express, { Response, Request } from "express";
import getJam from "@middleware/getJam";
import db from "@helper/db";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";

var router = express.Router();

router.put("/:gameSlug", getJam, async function (req, res) {
  const { gameSlug } = req.params;
  const {
    name,
    slug,
    description,
    thumbnail,
    banner,
    downloadLinks,
    category,
    ratingCategories,
    majRatingCategories,
    published,
    themeJustification,
    achievements,
    flags,
    tags,
    leaderboards,
  } = req.body;

  if (!name || !category) {
    res.status(400).send("Name is required.");
    return;
  }

  if (
    res.locals.jamPhase != "Rating" &&
    res.locals.jamPhase != "Submission" &&
    res.locals.jamPhase != "Jamming"
  ) {
    res
      .status(400)
      .send("Can't edit game outside of jamming and rating period.");
    return;
  }

  try {
    // Find the existing game
    const existingGame = await db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        ratingCategories: true,
        majRatingCategories: true,
        tags: true,
        flags: true,
        achievements: true,
        leaderboards: {
          include: {
            scores: true,
          },
        },
      },
    });

    if (!existingGame) {
      res.status(404).send("Game not found.");
      return;
    }

    if (res.locals.jamPhase == "Rating" && existingGame.category != category) {
      res.status(400).send("Can't update category outside of jamming period.");
      return;
    }

    const currentRatingCategories = existingGame.ratingCategories;
    const disconnectRatingCategories = currentRatingCategories.filter(
      (category) => !ratingCategories.includes(category.id)
    );
    const newRatingCategories = ratingCategories.filter(
      (category: number) =>
        currentRatingCategories.filter(
          (ratingCategory) => ratingCategory.id == category
        ).length == 0
    );

    const currentMajRatingCategories = existingGame.majRatingCategories;
    const disconnectMajRatingCategories = currentMajRatingCategories.filter(
      (category) => !majRatingCategories.includes(category.id)
    );
    const newMajRatingCategories = majRatingCategories.filter(
      (category: number) =>
        currentMajRatingCategories.filter(
          (ratingCategory) => ratingCategory.id == category
        ).length == 0
    );

    const curTags = existingGame.tags;
    const disTags = curTags.filter((curTag) => !tags.includes(curTag.id));
    const newTags = tags.filter(
      (tag: number) => curTags.filter((curTag) => curTag.id == tag).length == 0
    );

    const curFlags = existingGame.flags;
    const disFlags = curFlags.filter((curFlag) => !flags.includes(curFlag.id));
    const newFlags = flags.filter(
      (tag: number) =>
        curFlags.filter((curFlag) => curFlag.id == tag).length == 0
    );

    // Update the game
    const updatedGame = await db.game.update({
      where: { slug: gameSlug },
      data: {
        name,
        slug,
        description,
        thumbnail,
        banner,
        downloadLinks: {
          deleteMany: {}, // Remove all existing download links
          create: downloadLinks.map(
            (link: { url: string; platform: string }) => ({
              url: link.url,
              platform: link.platform,
            })
          ),
        },
        ratingCategories: {
          disconnect: disconnectRatingCategories.map((categry) => ({
            id: categry.id,
          })),
          connect: newRatingCategories.map((category: number) => ({
            id: category,
          })),
        },
        majRatingCategories: {
          disconnect: disconnectMajRatingCategories.map((categry) => ({
            id: categry.id,
          })),
          connect: newMajRatingCategories.map((category: number) => ({
            id: category,
          })),
        },
        tags: {
          disconnect: disTags.map((tag) => ({
            id: tag.id,
          })),
          connect: newTags.map((tag: number) => ({
            id: tag,
          })),
        },
        flags: {
          disconnect: disFlags.map((flag) => ({
            id: flag.id,
          })),
          connect: newFlags.map((flag: number) => ({
            id: flag,
          })),
        },
        category,
        published,
        themeJustification,
      },
      include: {
        downloadLinks: true,
      },
    });

    for (const leaderboard of leaderboards) {
      if (
        existingGame.leaderboards.filter(
          (curLeaderboard) => curLeaderboard.id == leaderboard.id
        ).length > 0
      ) {
        await db.leaderboard.update({
          where: {
            id: leaderboard.id,
          },
          data: {
            type: leaderboard.type,
            name: leaderboard.name,
            onlyBest: leaderboard.onlyBest,
            maxUsersShown: leaderboard.maxUsersShown,
            decimalPlaces: leaderboard.decimalPlaces,
          },
        });
      } else {
        await db.leaderboard.create({
          data: {
            type: leaderboard.type,
            name: leaderboard.name,
            onlyBest: leaderboard.onlyBest,
            maxUsersShown: leaderboard.maxUsersShown,
            decimalPlaces: leaderboard.decimalPlaces,
            game: {
              connect: {
                id: updatedGame.id,
              },
            },
          },
        });
      }
    }

    for (const leaderboard of existingGame.leaderboards) {
      if (
        leaderboards.filter((leaderboard2) => leaderboard2.id == leaderboard.id)
          .length == 0
      ) {
        if (leaderboard.scores) {
          for (const score of leaderboard.scores) {
            await db.score.delete({
              where: {
                id: score.id,
              },
            });
          }
        }

        await db.leaderboard.delete({
          where: {
            id: leaderboard.id,
          },
        });
      }
    }

    for (const achievement of achievements) {
      if (
        existingGame.achievements.filter(
          (curAchievement) => curAchievement.id == achievement.id
        ).length > 0
      ) {
        await db.achievement.update({
          where: {
            id: achievement.id,
          },
          data: {
            name: achievement.name,
            description: achievement.description ? achievement.description : "",
            image: achievement.image ? achievement.image : "",
          },
        });
      } else {
        await db.achievement.create({
          data: {
            name: achievement.name,
            description: achievement.description ? achievement.description : "",
            image: achievement.image ? achievement.image : "",
            game: {
              connect: {
                id: updatedGame.id,
              },
            },
          },
        });
      }
    }

    for (const achievement of existingGame.achievements) {
      if (
        achievements.filter((achievement2) => achievement2.id == achievement.id)
          .length == 0
      ) {
        await db.achievement.delete({
          where: {
            id: achievement.id,
          },
        });
      }
    }

    res.json(updatedGame);
  } catch (error) {
    console.error("Error updating game:", error);
    res.status(500).send("Internal server error.");
  }
});

router.get(
  "/:gameSlug",
  authUserOptional,
  getUserOptional,
  getJam,
  async function (req, res) {
    const { gameSlug } = req.params;

    const game = await db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        downloadLinks: true,
        ratingCategories: true,
        majRatingCategories: true,
        tags: true,
        flags: true,
        leaderboards: {
          include: {
            scores: {
              include: {
                user: true,
              },
            },
          },
        },
        team: {
          include: {
            owner: true,
            users: {
              include: {
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
          include: {
            user: {
              select: {
                teams: {
                  select: {
                    game: {
                      select: {
                        published: true,
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
        achievements: true,
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
      },
    });

    if (!game) {
      res.status(404).send("Game not found");
      return;
    }

    let commentsWithHasLiked = game?.comments;

    if (res.locals.user) {
      function addHasLikedToComments(comments: any[]): any {
        return comments?.map((comment) => ({
          ...comment,
          hasLiked:
            res.locals.user &&
            comment.likes?.some(
              (like: any) => like.userId === res.locals.user.id
            ),
          children: comment.children
            ? addHasLikedToComments(comment.children)
            : [],
        }));
      }

      commentsWithHasLiked = addHasLikedToComments(game?.comments);
    }

    // Ratings info

    let scores = {};

    if (res.locals.jam.id !== game.jamId || res.locals.user.id == 3) {
      let games = await db.game.findMany({
        include: {
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

      let filteredGames = games.map((game) => {
        const categories = [...game.ratingCategories, ...ratingCategories];
        const categoryIds = categories.map(
          (ratingCategory) => ratingCategory.id
        );

        // Filter out ratings in categories the game has opted out of (in case they opt out later)
        const filteredRatings = game.ratings.filter((rating) =>
          categoryIds.includes(rating.categoryId)
        );

        const categoryAverages = categories.map((category) => {
          const categoryRatings = filteredRatings.filter(
            (rating) => rating.categoryId === category.id
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

      const newfilteredgames = filteredGames
        .filter((game) => {
          const overallCategory = game.categoryAverages.find(
            (avg) => avg.categoryName === "Overall"
          );
          return overallCategory && overallCategory.ratingCount >= 5;
        })
        .filter((game) => game.ratingsCount >= 4.99);

      // TODO: ONLY SHOW GAEMS THAT HAVE 5 OF THE THING
      newfilteredgames.forEach((game) => {
        game.categoryAverages.forEach((category) => {
          // Rank games within each category by averageScore
          const rankedGamesInCategory = newfilteredgames
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

      const newgame = newfilteredgames.filter((fgame) => fgame.id == game.id);

      if (newgame.length > 0) {
        newgame[0].categoryAverages.forEach((cat) => {
          if (!scores[cat.categoryName]) {
            scores[cat.categoryName] = {};
          }
          scores[cat.categoryName].placement = cat.placement;
        });
      }

      const gamedet = filteredGames.filter((fgame) => fgame.id == game.id);

      if (gamedet.length > 0) {
        gamedet[0].categoryAverages.forEach((cat) => {
          if (!scores[cat.categoryName]) {
            scores[cat.categoryName] = {};
          }
          scores[cat.categoryName].averageScore = cat.averageScore;
          scores[cat.categoryName].ratingCount = cat.ratingCount;
        });
      }
    }

    res.json({
      ...game,
      comments: commentsWithHasLiked,
      scores,
    });
  }
);

router.get("/", async function (req: Request, res: Response) {
  const { sort } = req.query;
  let orderBy: {} | undefined = {};

  switch (sort) {
    case "oldest":
      orderBy = { id: "asc" };
      break;
    case "newest":
      orderBy = { id: "desc" };
      break;
    case "leastrated":
      orderBy = undefined;
      break;
    case "danger":
      orderBy = undefined;
      break;
    case "random":
      orderBy = undefined;
    default:
      orderBy = { id: "desc" };
      break;
  }

  let game = await db.game.findMany({
    include: {
      jam: true,
      ratingCategories: true,
      ratings: {
        include: {
          user: {
            select: {
              teams: {
                select: {
                  game: {
                    select: {
                      published: true,
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
    },
    where: {
      published: true,
    },
    orderBy,
  });

  if (!game) {
    res.status(404).send("No Games were found");
    return;
  }

  const ratingCategories = await db.ratingCategory.findMany({
    where: {
      always: true,
    },
  });

  if (sort === "random") {
    game = game.sort(() => Math.random() - 0.5);
  }

  if (sort === "leastratings") {
    game = game.sort(
      (a, b) =>
        a.ratings.length /
          (a.ratingCategories.length + ratingCategories.length) -
        b.ratings.length / (b.ratingCategories.length + ratingCategories.length)
    );
  }

  if (sort === "danger") {
    game = game.filter((game) =>
      game.ratingCategories.some(
        (category) =>
          game.ratings.filter(
            (rating) =>
              rating.user.teams.some(
                (team) => team.game && team.game.published
              ) && rating.categoryId === category.id
          ).length < 5
      )
    );
    game = game.sort(
      (a, b) =>
        b.ratings.length /
          (b.ratingCategories.length + ratingCategories.length) -
        a.ratings.length / (a.ratingCategories.length + ratingCategories.length)
    );
  }

  res.json(game);
});

export default router;
