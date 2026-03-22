import express, { Response, Request } from "express";
import getJam from "@middleware/getJam";
import db from "@helper/db";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "@helper/contentModeration";
import { notifyNewMentions } from "@helper/mentionNotifications";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "@helper/recommendations";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";

var router = express.Router();
const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;
const PREFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const ITCH_EMBED_ASPECT_RATIOS = new Set([
  "16 / 9",
  "16 / 10",
  "21 / 9",
  "4 / 3",
  "5 / 4",
  "1 / 1",
  "3 / 2",
  "2 / 3",
  "3 / 4",
  "9 / 16",
  "10 / 16",
]);

const backgroundUsageAllowedByDefault = (license?: string | null) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();

  return normalized === "CC0" || normalized === "CC BY";
};

const backgroundUsageAttributionAllowedByDefault = (
  license?: string | null,
) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();

  return normalized !== "CC0";
};

const buildPrefix = (seed?: string | null) => {
  const normalized = (seed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    normalized.length >= MIN_PREFIX_LENGTH &&
    normalized.length <= MAX_PREFIX_LENGTH
  ) {
    return normalized;
  }

  const base = normalized.slice(0, DEFAULT_PREFIX_LENGTH);
  let prefix = base;
  for (let i = prefix.length; i < DEFAULT_PREFIX_LENGTH; i += 1) {
    prefix += PREFIX_CHARS[Math.floor(Math.random() * PREFIX_CHARS.length)];
  }
  return prefix;
};

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
    short,
    songs,
    screenshots,
    trailerUrl,
    itchEmbedUrl,
    itchEmbedAspectRatio,
    userSlug,
    inputMethods,
    estOneRun,
    estAnyPercent,
    estHundredPercent,
    emotePrefix,
  } = req.body;

  if (!name || !category) {
    res.status(400).send("Name is required.");
    return;
  }

  if (
    itchEmbedAspectRatio != null &&
    !ITCH_EMBED_ASPECT_RATIOS.has(String(itchEmbedAspectRatio))
  ) {
    res.status(400).send("Invalid itch embed aspect ratio.");
    return;
  }

  // if (
  //   res.locals.jamPhase != "Rating" &&
  //   res.locals.jamPhase != "Submission" &&
  //   res.locals.jamPhase != "Jamming"
  // ) {
  //   res
  //     .status(400)
  //     .send("Can't edit game outside of jamming and rating period.");
  //   return;
  // }

  try {
    // Find the existing game
    const existingGame = await db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        ratingCategories: true,
        majRatingCategories: true,
        tags: true,
        flags: true,
        tracks: {
          include: {
            tags: true,
            flags: true,
            links: true,
            credits: true,
          },
        },
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

    if (
      res.locals.jamPhase == "Rating" &&
      existingGame.category != category &&
      category != "EXTRA" // So it can swap from regular to extra in rating period
    ) {
      res.status(400).send("Can't update category outside of jamming period.");
      return;
    }

    const currentRatingCategories = existingGame.ratingCategories;
    const disconnectRatingCategories = currentRatingCategories.filter(
      (category) => !ratingCategories.includes(category.id),
    );
    const newRatingCategories = ratingCategories.filter(
      (category: number) =>
        currentRatingCategories.filter(
          (ratingCategory) => ratingCategory.id == category,
        ).length == 0,
    );

    const currentMajRatingCategories = existingGame.majRatingCategories;
    const disconnectMajRatingCategories = currentMajRatingCategories.filter(
      (category) => !majRatingCategories.includes(category.id),
    );
    const newMajRatingCategories = majRatingCategories.filter(
      (category: number) =>
        currentMajRatingCategories.filter(
          (ratingCategory) => ratingCategory.id == category,
        ).length == 0,
    );

    const curTags = existingGame.tags;
    const disTags = curTags.filter((curTag) => !tags.includes(curTag.id));
    const newTags = tags.filter(
      (tag: number) => curTags.filter((curTag) => curTag.id == tag).length == 0,
    );

    const curFlags = existingGame.flags;
    const disFlags = curFlags.filter((curFlag) => !flags.includes(curFlag.id));
    const newFlags = flags.filter(
      (tag: number) =>
        curFlags.filter((curFlag) => curFlag.id == tag).length == 0,
    );

    // Update the game
    const oldPrefix = existingGame.emotePrefix ?? null;
    let prefixUpdates: Array<{ id: number; slug: string }> | null = null;
    let cleanedPrefix = emotePrefix
      ? String(emotePrefix).trim().toLowerCase()
      : null;
    if (cleanedPrefix) {
      if (!/^[a-z0-9]{4,8}$/.test(cleanedPrefix)) {
        res.status(400).send("Emote prefix must be 4 to 8 characters.");
        return;
      }
    } else {
      const seed = slug || existingGame.slug;
      cleanedPrefix = buildPrefix(seed);
    }

    if (cleanedPrefix && cleanedPrefix !== oldPrefix) {
      const gameReactions = await db.reaction.findMany({
        where: {
          scopeType: "GAME",
          scopeGameId: existingGame.id,
        },
        select: { id: true, slug: true },
      });

      if (gameReactions.length > 0) {
        const suffixLength = oldPrefix ? oldPrefix.length : 6;
        prefixUpdates = gameReactions.map((reaction) => {
          const suffix = reaction.slug.slice(suffixLength);
          const nextSlug = `${cleanedPrefix}${suffix}`;
          return { id: reaction.id, slug: nextSlug };
        });

        const nextSlugs = prefixUpdates.map((u) => u.slug);
        const uniqueNext = new Set(nextSlugs);
        if (uniqueNext.size !== nextSlugs.length) {
          res.status(409).send("Emote prefix causes duplicates.");
          return;
        }

        const conflicts = await db.reaction.findMany({
          where: {
            slug: { in: nextSlugs },
            NOT: { id: { in: prefixUpdates.map((u) => u.id) } },
          },
          select: { id: true },
        });
        if (conflicts.length > 0) {
          res.status(409).send("Emote prefix already in use.");
          return;
        }
      }
    }

    const updatedGame = await db.game.update({
      where: { slug: gameSlug },
      data: {
        name,
        slug,
        description,
        thumbnail,
        banner,
        short,
        emotePrefix: cleanedPrefix,
        screenshots: Array.isArray(screenshots) ? screenshots : [],
        trailerUrl,
        itchEmbedUrl,
        itchEmbedAspectRatio,
        inputMethods: Array.isArray(inputMethods) ? inputMethods : [],
        estOneRun,
        estAnyPercent,
        estHundredPercent,
        downloadLinks: {
          deleteMany: {}, // Remove all existing download links
          create: downloadLinks.map(
            (link: { url: string; platform: string }) => ({
              url: link.url,
              platform: link.platform,
            }),
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

    const actor = userSlug
      ? await db.user.findUnique({
          where: { slug: userSlug },
          select: { id: true, name: true, slug: true },
        })
      : null;

    if (actor) {
      await notifyNewMentions({
        type: "game",
        actorId: actor.id,
        actorName: actor.name,
        actorSlug: actor.slug,
        beforeContent: existingGame.description,
        afterContent: description,
        gameId: updatedGame.id,
        gameSlug: updatedGame.slug,
        gameName: updatedGame.name,
      });
    }

    if (prefixUpdates && prefixUpdates.length > 0) {
      await db.$transaction(
        prefixUpdates.map((update) =>
          db.reaction.update({
            where: { id: update.id },
            data: { slug: update.slug },
          }),
        ),
      );
    }

    for (const leaderboard of leaderboards) {
      if (
        existingGame.leaderboards.filter(
          (curLeaderboard) => curLeaderboard.id == leaderboard.id,
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

    // figure out which existing tracks to keep (ids already present in DB)
    const existingIds = new Set(existingGame.tracks.map((t) => t.id));

    const keepTrackIds = songs
      .map((s: any) => s?.id)
      .filter(
        (id: unknown): id is number =>
          Number.isInteger(id) && existingIds.has(id),
      );

    // remove tracks that were deleted client-side
    const where: any = { gameId: updatedGame.id };
    if (keepTrackIds.length > 0) {
      where.id = { notIn: keepTrackIds };
    }
    await db.track.deleteMany({ where });

    for (const song of songs) {
      const hasRealId = Number.isInteger(song?.id) && existingIds.has(song.id);
      const primaryCreditUserId = Array.isArray(song.credits)
        ? (song.credits
            .map((credit: { role?: string; userId?: number | string }) => ({
              role: String(credit?.role ?? "").trim(),
              userId: Number(credit?.userId),
            }))
            .find(
              (credit) =>
                credit.role.toLowerCase() === "composer" &&
                Number.isInteger(credit.userId),
            )?.userId ??
          song.credits
            .map((credit: { role?: string; userId?: number | string }) => ({
              role: String(credit?.role ?? "").trim(),
              userId: Number(credit?.userId),
            }))
            .find((credit) => Number.isInteger(credit.userId))?.userId ??
          null)
        : null;

      if (hasRealId) {
        await db.track.update({
          where: { id: song.id },
          data: {
            name: song.name,
            url: song.url,
            slug: song.slug,
            commentary: song.commentary || null,
            bpm:
              typeof song.bpm === "number" && Number.isFinite(song.bpm)
                ? Math.max(1, Math.floor(song.bpm))
                : null,
            musicalKey: song.musicalKey || null,
            softwareUsed: Array.isArray(song.softwareUsed)
              ? song.softwareUsed.filter(Boolean)
              : [],
            license: song.license || null,
            allowDownload: Boolean(song.allowDownload),
            allowBackgroundUse:
              typeof song.allowBackgroundUse === "boolean"
                ? song.allowBackgroundUse
                : backgroundUsageAllowedByDefault(song.license),
            allowBackgroundUseAttribution:
              typeof song.allowBackgroundUseAttribution === "boolean"
                ? song.allowBackgroundUseAttribution
                : backgroundUsageAttributionAllowedByDefault(song.license),
            tags: {
              set: Array.isArray(song.tagIds)
                ? song.tagIds
                    .map((id: number | string) => Number(id))
                    .filter((id: number) => Number.isInteger(id))
                    .map((id: number) => ({ id }))
                : [],
            },
            flags: {
              set: Array.isArray(song.flagIds)
                ? song.flagIds
                    .map((id: number | string) => Number(id))
                    .filter((id: number) => Number.isInteger(id))
                    .map((id: number) => ({ id }))
                : [],
            },
            links: {
              deleteMany: {},
              create: Array.isArray(song.links)
                ? song.links
                    .map((link: { label?: string; url?: string }) => ({
                      label: String(link?.label ?? "").trim(),
                      url: String(link?.url ?? "").trim(),
                    }))
                    .filter((link) => link.label && link.url)
                : [],
            },
            credits: {
              deleteMany: {},
              create: Array.isArray(song.credits)
                ? song.credits
                    .map(
                      (credit: {
                        role?: string;
                        userId?: number | string;
                      }) => ({
                        role: String(credit?.role ?? "").trim(),
                        userId: Number(credit?.userId),
                      }),
                    )
                    .filter(
                      (credit) =>
                        credit.role.length > 0 &&
                        Number.isInteger(credit.userId),
                    )
                : [],
            },
            ...(primaryCreditUserId || song.composerId
              ? {
                  composer: {
                    connect: { id: primaryCreditUserId || song.composerId },
                  },
                }
              : {}),
          },
        });
      } else {
        await db.track.create({
          data: {
            name: song.name,
            slug: song.slug,
            url: song.url,
            commentary: song.commentary || null,
            bpm:
              typeof song.bpm === "number" && Number.isFinite(song.bpm)
                ? Math.max(1, Math.floor(song.bpm))
                : null,
            musicalKey: song.musicalKey || null,
            softwareUsed: Array.isArray(song.softwareUsed)
              ? song.softwareUsed.filter(Boolean)
              : [],
            license: song.license || null,
            allowDownload: Boolean(song.allowDownload),
            allowBackgroundUse:
              typeof song.allowBackgroundUse === "boolean"
                ? song.allowBackgroundUse
                : backgroundUsageAllowedByDefault(song.license),
            allowBackgroundUseAttribution:
              typeof song.allowBackgroundUseAttribution === "boolean"
                ? song.allowBackgroundUseAttribution
                : backgroundUsageAttributionAllowedByDefault(song.license),
            tags: {
              connect: Array.isArray(song.tagIds)
                ? song.tagIds
                    .map((id: number | string) => Number(id))
                    .filter((id: number) => Number.isInteger(id))
                    .map((id: number) => ({ id }))
                : [],
            },
            flags: {
              connect: Array.isArray(song.flagIds)
                ? song.flagIds
                    .map((id: number | string) => Number(id))
                    .filter((id: number) => Number.isInteger(id))
                    .map((id: number) => ({ id }))
                : [],
            },
            links: {
              create: Array.isArray(song.links)
                ? song.links
                    .map((link: { label?: string; url?: string }) => ({
                      label: String(link?.label ?? "").trim(),
                      url: String(link?.url ?? "").trim(),
                    }))
                    .filter((link) => link.label && link.url)
                : [],
            },
            credits: {
              create: Array.isArray(song.credits)
                ? song.credits
                    .map(
                      (credit: {
                        role?: string;
                        userId?: number | string;
                      }) => ({
                        role: String(credit?.role ?? "").trim(),
                        userId: Number(credit?.userId),
                      }),
                    )
                    .filter(
                      (credit) =>
                        credit.role.length > 0 &&
                        Number.isInteger(credit.userId),
                    )
                : [],
            },
            composer: {
              connect: {
                id: primaryCreditUserId || song.composerId,
              },
            },
            game: { connect: { id: updatedGame.id } },
          },
        });
      }
    }

    for (const achievement of achievements) {
      if (
        existingGame.achievements.filter(
          (curAchievement) => curAchievement.id == achievement.id,
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
        achievements: {
          include: {
            users: true,
          },
        },
        tracks: {
          include: {
            composer: true,
            game: true,
            tags: {
              include: {
                category: true,
              },
            },
            flags: true,
            links: true,
            credits: {
              include: {
                user: true,
              },
            },
          },
        },
        leaderboards: {
          include: {
            scores: {
              include: {
                user: true,
              },
            },
          },
        },
        gameEmotes: {
          include: {
            artistUser: true,
            ownerGame: true,
            uploaderUser: true,
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
                        jamId: true,
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
                        jamId: true,
                        category: true,
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
      },
    });

    if (!game) {
      res.status(404).send("Game not found");
      return;
    }

    const commentsWithHasLiked = mapCommentsForViewer(
      game?.comments,
      res.locals.user?.id ?? null,
      isPrivilegedViewer(res.locals.user),
    );

    // Ratings info

    let scores = {};

    const currentJamMatches = res.locals.jam?.id === game.jamId;
    const canViewRecapScores = req.query.recap === "1";
    const canPreviewScores =
      req.query.preview === "1" && Boolean(res.locals.user?.admin);
    const jamStartMs = res.locals.jam?.startTime
      ? new Date(res.locals.jam.startTime).getTime()
      : null;
    const jamDurationMs =
      ((res.locals.jam?.jammingHours ?? 0) +
        (res.locals.jam?.submissionHours ?? 0) +
        (res.locals.jam?.ratingHours ?? 0)) *
      60 *
      60 *
      1000;
    const isJamOver =
      jamStartMs != null ? Date.now() >= jamStartMs + jamDurationMs : true;

    if (
      !currentJamMatches ||
      isJamOver ||
      canViewRecapScores ||
      canPreviewScores
    ) {
      let games = await db.game.findMany({
        where: {
          category: game.category,
          jamId: game.jamId,
        },
        include: {
          ratingCategories: true,
          majRatingCategories: true,
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

      let filteredGames = games.map((game2) => {
        const categories = [...game2.ratingCategories, ...ratingCategories];
        const categoryIds = categories.map(
          (ratingCategory) => ratingCategory.id,
        );

        // Filter out ratings in categories the game has opted out of (in case they opt out later)
        const filteredRatings = game2.ratings.filter((rating) =>
          categoryIds.includes(rating.categoryId),
        );

        const publishedRatings = filteredRatings.filter(
          (rating) =>
            rating.user.teams.filter((team) => team.game?.published).length > 0,
        );

        const categoryAverages = categories
          .filter(
            (category) =>
              !category.askMajorityContent ||
              game2.category != "REGULAR" ||
              game.majRatingCategories.filter((maj) => maj.id == category.id)
                .length == 0 ||
              game2.majRatingCategories.filter((maj) => maj.id == category.id)
                .length > 0,
          )
          .map((category) => {
            const categoryRatings = filteredRatings.filter(
              (rating) => rating.categoryId === category.id,
            );
            const categoryPublishedRatings = publishedRatings.filter(
              (rating) => rating.categoryId === category.id,
            );

            const averageRating =
              categoryRatings.length > 0
                ? categoryRatings.reduce(
                    (sum, rating) => sum + rating.value,
                    0,
                  ) / categoryRatings.length
                : 0;

            const averagePublishedRating =
              categoryPublishedRatings.length > 0
                ? categoryPublishedRatings.reduce(
                    (sum, rating) => sum + rating.value,
                    0,
                  ) / categoryPublishedRatings.length
                : 0;

            return {
              categoryId: category.id,
              categoryName: category.name,
              averageScore: averagePublishedRating,
              averageUnrankedScore: averageRating,
              ratingCount: categoryRatings.length,
              placement: -1,
            };
          });

        return {
          ...game2,
          categoryAverages,
          ratingsCount: game2.team.users.reduce((totalRatings, user) => {
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
            (avg) => avg.categoryName === "RatingCategory.Overall.Title",
          );
          return overallCategory && overallCategory.ratingCount >= 5;
        })
        .filter((game) => game.ratingsCount >= 4.99);

      if (game.category !== "EXTRA") {
        newfilteredgames.forEach((game) => {
          game.categoryAverages.forEach((category) => {
            // Rank games within each category by averageScore
            const rankedGamesInCategory = newfilteredgames
              .map((g) => {
                const categoryAvg = g.categoryAverages.find(
                  (cat) => cat.categoryId === category.categoryId,
                );
                return {
                  gameId: g.id,
                  score: categoryAvg ? categoryAvg.averageScore : 0,
                };
              })
              .sort((a, b) => b.score - a.score);

            const gamePlacement = rankedGamesInCategory.findIndex(
              (rankedGame) => rankedGame.gameId === game.id,
            );

            category.placement = gamePlacement + 1;
          });
        });
      }

      const newgame = newfilteredgames.filter((fgame) => fgame.id == game.id);

      if (newgame.length > 0) {
        newgame[0].categoryAverages.forEach((cat) => {
          if (cat.ratingCount >= 5) {
            if (!scores[cat.categoryName]) {
              scores[cat.categoryName] = {};
            }
            scores[cat.categoryName].placement = cat.placement;
          }
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
          scores[cat.categoryName].averageUnrankedScore =
            cat.averageUnrankedScore;
        });
      }
    }

    res.json({
      ...game,
      comments: commentsWithHasLiked,
      scores,
    });
  },
);

router.get("/", async function (req: Request, res: Response) {
  const { sort, jamId } = req.query;
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
    case "recommended":
      orderBy = undefined;
    case "ratingbalance":
      orderBy = undefined;
    case "karma":
      orderBy = undefined;
    default:
      orderBy = { id: "desc" };
      break;
  }

  const where: any = { published: true };
  if (jamId) {
    const parsed = parseInt(jamId as string, 10);
    if (!Number.isNaN(parsed)) {
      where.jamId = parsed;
    }
  }

  let game = await db.game.findMany({
    include: {
      jam: true,
      ratingCategories: true,
      downloadLinks: true,
      tags: true,
      flags: true,
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
      team: {
        select: {
          users: {
            select: {
              id: true,
              achievements: {
                select: {
                  gameId: true,
                  game: {
                    select: {
                      jamId: true,
                    },
                  },
                },
              },
              scores: {
                select: {
                  leaderboard: {
                    select: {
                      gameId: true,
                      game: {
                        select: {
                          jamId: true,
                        },
                      },
                    },
                  },
                },
              },
              comments: {
                select: {
                  gameId: true,
                  game: {
                    select: {
                      jamId: true,
                    },
                  },
                  likes: {
                    select: {
                      userId: true,
                      id: true,
                    },
                  },
                },
              },
              ratings: {
                select: {
                  gameId: true,
                  game: { select: { jamId: true, ratingCategories: true } },
                },
              },
            },
          },
        },
      },
    },
    where,
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
        b.ratings.length /
          (b.ratingCategories.length + ratingCategories.length),
    );
  }

  const isAllowedRaterInJam = (
    r: (typeof game)[number]["ratings"][number],
    jamId: number,
  ) =>
    r.user.teams.some((t) => {
      const tg = t.game;
      return (
        tg && tg.published && tg.jamId === jamId && tg.category !== "EXTRA"
      );
    });

  if (sort === "danger") {
    // Only non extra games
    game = game.filter((g) => g.category !== "EXTRA");

    // Exclude games that have more than 5 ratings in all categories
    game = game.filter((g) =>
      g.ratingCategories.some((cat) => {
        const allowedCount = g.ratings.filter(
          (r) => r.categoryId === cat.id && isAllowedRaterInJam(r, g.jamId),
        ).length;
        return allowedCount < 5;
      }),
    );

    // Sort by normalized count
    game = game.sort((a, b) => {
      const allowedA = a.ratings.filter((r) =>
        isAllowedRaterInJam(r, a.jamId),
      ).length;
      const allowedB = b.ratings.filter((r) =>
        isAllowedRaterInJam(r, b.jamId),
      ).length;

      const normA =
        allowedA / (a.ratingCategories.length + ratingCategories.length);
      const normB =
        allowedB / (b.ratingCategories.length + ratingCategories.length);

      return normB - normA;
    });
  }

  if (sort === "ratingbalance") {
    const diff = (g: (typeof game)[number]) => {
      const given = g.team.users.reduce(
        (prev, cur) =>
          prev +
          cur.ratings.reduce(
            (prev2, cur2) =>
              prev2 +
              (cur2.game.jamId === g.jamId
                ? 1 /
                  (cur2.game.ratingCategories.length + ratingCategories.length)
                : 0),
            0,
          ),
        0,
      );

      const gotten =
        g.ratings.filter(
          (rating) =>
            rating.user.teams.filter(
              (team) =>
                team.game &&
                team.game.jamId == g.jamId &&
                team.game.published &&
                team.game.category !== "EXTRA",
            ).length > 0,
        ).length /
        (g.ratingCategories.length + ratingCategories.length);

      return given - gotten;
    };

    game = game.sort((a, b) => diff(b) - diff(a));
  }

  if (sort === "karma" || sort === "recommended") {
    const exponent = 0.73412;
    const recommendationWeight = 2;
    const recommendationSlots = 3;
    const jamIds = [...new Set(game.map((entry) => entry.jamId))];
    const overallCategoryId =
      ratingCategories.find(
        (category) => category.name === "RatingCategory.Overall.Title",
      )?.id ?? null;

    const recommendedPointsByGameId = new Map<number, number>();

    if (overallCategoryId && jamIds.length > 0) {
      const recommendationRatings = await db.rating.findMany({
        where: {
          game: {
            jamId: { in: jamIds },
          },
        },
        select: {
          gameId: true,
          userId: true,
          categoryId: true,
          value: true,
          updatedAt: true,
          game: {
            select: {
              jamId: true,
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
      });
      const ratingsByUser = new Map<
        number,
        Array<{
          gameId: number;
          jamId: number;
          value: number;
          tieBreakerValue: number;
          updatedAt: number;
        }>
      >();
      const ratingAveragesByUserGame = new Map<
        number,
        Map<number, { total: number; count: number }>
      >();

      recommendationRatings.forEach((rating) => {
        if (!isAllowedRaterInJam(rating, rating.game.jamId)) return;

        const averagesForUser =
          ratingAveragesByUserGame.get(rating.userId) ?? new Map();
        const aggregate = averagesForUser.get(rating.gameId) ?? {
          total: 0,
          count: 0,
        };
        aggregate.total += rating.value;
        aggregate.count += 1;
        averagesForUser.set(rating.gameId, aggregate);
        ratingAveragesByUserGame.set(rating.userId, averagesForUser);
      });

      recommendationRatings.forEach((rating) => {
        if (!isAllowedRaterInJam(rating, rating.game.jamId)) return;
        if (rating.categoryId !== overallCategoryId) return;

        const existing = ratingsByUser.get(rating.userId) ?? [];
        const averagesForUser = ratingAveragesByUserGame.get(rating.userId);
        const average = averagesForUser?.get(rating.gameId);
        existing.push({
          gameId: rating.gameId,
          jamId: rating.game.jamId,
          value: rating.value,
          tieBreakerValue: average
            ? average.total / average.count
            : rating.value,
          updatedAt: rating.updatedAt.getTime(),
        });
        ratingsByUser.set(rating.userId, existing);
      });

      const recommendationUsers = await db.user.findMany({
        where: { id: { in: [...ratingsByUser.keys()] } },
        select: {
          id: true,
          recommendedGameOverrideIds: true,
          recommendedGameHiddenIds: true,
        },
      });
      const recommendationUserMap = new Map(
        recommendationUsers.map((user) => [user.id, user]),
      );

      ratingsByUser.forEach((entries, userId) => {
        const ranking = rankRecommendationCandidates(
          entries.map((entry) => ({
            itemId: entry.gameId,
            value: entry.value,
            tieBreakerValue: entry.tieBreakerValue,
            updatedAt: entry.updatedAt,
          })),
        );
        if (!ranking.eligible) return;

        const recommendationUser = recommendationUserMap.get(userId);
        applyRecommendationOverrides(
          ranking.candidateIds,
          recommendationUser?.recommendedGameOverrideIds ?? [],
          recommendationUser?.recommendedGameHiddenIds ?? [],
          recommendationSlots,
        )
          .filter((gameId) =>
            entries.some(
              (entry) => entry.gameId === gameId && jamIds.includes(entry.jamId),
            ),
          )
          .forEach((entry) => {
            const current = recommendedPointsByGameId.get(entry) ?? 0;
            recommendedPointsByGameId.set(entry, current + 1);
          });
      });
    }

    const karmaScore = (g: (typeof game)[number]) => {
      const given = g.team.users.reduce(
        (prev, cur) =>
          prev +
          cur.ratings.reduce(
            (prev2, cur2) =>
              prev2 +
              (cur2.game.jamId === g.jamId
                ? 1 /
                  (cur2.game.ratingCategories.length + ratingCategories.length)
                : 0),
            0,
          ),
        0,
      );

      const gotten =
        g.ratings.filter(
          (rating) =>
            rating.user.teams.filter(
              (team) =>
                team.game &&
                team.game.jamId == g.jamId &&
                team.game.published &&
                team.game.category !== "EXTRA",
            ).length > 0,
        ).length /
        (g.ratingCategories.length + ratingCategories.length);

      const likes = g.team.users.reduce(
        (prev, cur) =>
          prev +
          cur.comments
            .filter(
              (comment) =>
                comment.gameId &&
                comment.game &&
                comment.gameId !== g.id &&
                comment.game.jamId === g.jamId,
            )
            .reduce(
              (prev2, cur2) =>
                prev2 +
                cur2.likes.filter(
                  (like) =>
                    g.team.users
                      .map((user) => user.id)
                      .filter((user) => user === like.userId).length === 0,
                ).length,
              0,
            ),
        0,
      );

      const scores = g.team.users.reduce(
        (prev, cur) =>
          prev +
          [
            ...new Set(
              cur.scores
                .filter((sc) => sc.leaderboard.game.jamId === g.jamId)
                .map((sc) => sc.leaderboard.gameId),
            ),
          ].length,
        0,
      );

      const achievements = g.team.users.reduce(
        (prev, cur) =>
          prev +
          [
            ...new Set(
              cur.achievements
                .filter((ach) => ach.game.jamId === g.jamId)
                .map((ach) => ach.gameId),
            ),
          ].length,
        0,
      );

      const ratingScore = given ** exponent;
      const heartScore = likes ** exponent;
      const achScore = 0.3333 * achievements ** exponent;
      const scScore = 0.3333 * scores ** exponent;
      const ratingsReceived = gotten;

      return ratingScore + heartScore + achScore + scScore - ratingsReceived;
    };

    const recommendedBoost = (g: (typeof game)[number]) => {
      const points = recommendedPointsByGameId.get(g.id) ?? 0;
      if (points <= 0) return 0;
      return recommendationWeight * points ** exponent;
    };

    game = game.sort((a, b) => {
      const aScore =
        karmaScore(a) + (sort === "recommended" ? recommendedBoost(a) : 0);
      const bScore =
        karmaScore(b) + (sort === "recommended" ? recommendedBoost(b) : 0);

      return bScore - aScore;
    });
  }

  res.json(game);
});

export default router;
