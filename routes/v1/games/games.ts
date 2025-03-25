import express, { Response, Request } from "express";
import { PrismaClient } from "@prisma/client";
import getJam from "@middleware/getJam";
import db from "@helper/db";

const prisma = new PrismaClient();
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
    const existingGame = await prisma.game.findUnique({
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
    const updatedGame = await prisma.game.update({
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

router.get("/:gameSlug", async function (req, res) {
  const { gameSlug } = req.params;

  const game = await prisma.game.findUnique({
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

  res.json(game);
});

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
    case "random":
      orderBy = undefined;
    default:
      orderBy = { id: "desc" };
      break;
  }

  let game = await prisma.game.findMany({
    include: {
      jam: true,
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

  if (sort === "random") {
    game = game.sort(() => Math.random() - 0.5);
  }

  res.json(game);
});

export default router;
