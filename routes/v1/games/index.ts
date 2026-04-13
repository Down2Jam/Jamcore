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
import {
  buildGamePagePayload,
  materializeGamePage,
  pageVersionFromInput,
} from "@helper/gamePages";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";
import { PageVersion } from "@prisma/client";

var router = express.Router();
const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;
const SCORE_SORT_RATING_GOAL = 5;
const SCORE_SORT_MIDPOINT = 6;
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

const postJamPageInclude = {
  ratingCategories: true,
  majRatingCategories: true,
  tags: true,
  flags: true,
  downloadLinks: true,
  achievements: {
    include: {
      users: true,
    },
  },
  leaderboards: true,
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
          children: true,
        },
      },
    },
  },
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
          user: true,
        },
      },
    },
  },
} as const;

function getPostJamPage(game: any) {
  return (
    game?.postJamPage ??
    game?.pages?.find((page: any) => page.version === PageVersion.POST_JAM) ??
    null
  );
}

function getJamPage(game: any) {
  return (
    game?.jamPage ??
    game?.pages?.find((page: any) => page.version === PageVersion.JAM) ??
    null
  );
}

type ListingPageVersion = PageVersion | "ALL";

function parseListingPageVersion(value: unknown): ListingPageVersion {
  return value === "POST_JAM" || value === "ALL" ? value : PageVersion.JAM;
}

function getListingVersions(
  game: any,
  listingPageVersion: ListingPageVersion,
): PageVersion[] {
  const jamPage = getJamPage(game);
  const postJamPage = getPostJamPage(game);

  if (listingPageVersion === "POST_JAM") {
    return postJamPage ? [PageVersion.POST_JAM] : [];
  }

  if (listingPageVersion === "ALL") {
    if (postJamPage) {
      return [PageVersion.POST_JAM];
    }

    return jamPage ? [PageVersion.JAM] : [];
  }

  return jamPage ? [PageVersion.JAM] : [];
}

function getRatingPageVersion(rating: any): PageVersion {
  return rating?.gamePage?.version === PageVersion.POST_JAM
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

function getRatingGame(rating: any) {
  return rating?.gamePage?.game ?? rating?.game ?? null;
}

function getRatingCategoryCount(rating: any) {
  return (
    rating?.gamePage?.ratingCategories?.length ??
    rating?.game?.ratingCategories?.length ??
    0
  );
}

function buildPostJamBodyFromGame(game: any) {
  const jamPage = getJamPage(game) ?? game;

  return {
    ...jamPage,
    ratingCategories: (jamPage.ratingCategories ?? []).map(
      (entry: any) => entry.id,
    ),
    majRatingCategories: (jamPage.majRatingCategories ?? []).map(
      (entry: any) => entry.id,
    ),
    flags: (jamPage.flags ?? []).map((entry: any) => entry.id),
    tags: (jamPage.tags ?? []).map((entry: any) => entry.id),
    achievements: (jamPage.achievements ?? []).map((entry: any) => ({
      name: entry.name,
      description: entry.description ?? "",
      image: entry.image ?? "",
    })),
    leaderboards: (jamPage.leaderboards ?? []).map((entry: any) => ({
      name: entry.name,
      type: entry.type,
      onlyBest: entry.onlyBest,
      maxUsersShown: entry.maxUsersShown,
      decimalPlaces: entry.decimalPlaces,
    })),
    downloadLinks: (jamPage.downloadLinks ?? []).map((entry: any) => ({
      url: entry.url,
      platform: entry.platform,
    })),
    songs: (jamPage.tracks ?? []).map((song: any) => ({
      name: song.name,
      slug: song.slug,
      url: song.url,
      commentary: song.commentary ?? null,
      tagIds: (song.tags ?? []).map((entry: any) => entry.id),
      flagIds: (song.flags ?? []).map((entry: any) => entry.id),
      bpm: song.bpm ?? null,
      musicalKey: song.musicalKey ?? null,
      softwareUsed: song.softwareUsed ?? [],
      links: (song.links ?? []).map((entry: any) => ({
        label: entry.label,
        url: entry.url,
      })),
      credits: (song.credits ?? []).map((entry: any) => ({
        role: entry.role,
        userId: entry.userId,
      })),
      composerId: song.composerId ?? song.composer?.id,
      license: song.license ?? null,
      allowDownload: Boolean(song.allowDownload),
      allowBackgroundUse: Boolean(song.allowBackgroundUse),
      allowBackgroundUseAttribution: Boolean(
        song.allowBackgroundUseAttribution,
      ),
    })),
  };
}

async function upsertGamePage(gameId: number, version: PageVersion, body: any) {
  const existingPage = await db.gamePage.findFirst({
    where: {
      gameId,
      version,
    },
    select: { id: true },
  });

  const pagePayload = buildGamePagePayload(body);

  const buildTrackWriteData = (song: any) => {
    const normalizedCredits = Array.isArray(song.credits)
      ? song.credits
          .map((credit: { role?: string; userId?: number | string }) => ({
            role: String(credit?.role ?? "").trim(),
            userId: Number(credit?.userId),
          }))
          .filter(
            (credit) =>
              credit.role.length > 0 && Number.isInteger(credit.userId),
          )
      : [];

    const primaryCreditUserId =
      normalizedCredits.find(
        (credit) => credit.role.toLowerCase() === "composer",
      )?.userId ??
      normalizedCredits.find((credit) => Number.isInteger(credit.userId))
        ?.userId ??
      song.composerId;

    return {
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
      composerId: primaryCreditUserId,
      tagIds: Array.isArray(song.tagIds) ? song.tagIds : [],
      flagIds: Array.isArray(song.flagIds) ? song.flagIds : [],
      links: Array.isArray(song.links)
        ? song.links
            .map((link: any) => ({
              label: String(link?.label ?? "").trim(),
              url: String(link?.url ?? "").trim(),
            }))
            .filter((link: any) => link.label && link.url)
        : [],
      credits: normalizedCredits,
    };
  };

  const syncGamePageTracks = async (pageId: number, songs: any[]) => {
    const existingTracks = await db.gamePageTrack.findMany({
      where: { gamePageId: pageId },
      select: {
        id: true,
        slug: true,
        ratings: { select: { id: true } },
        timestampComments: { select: { id: true } },
      },
    });

    const existingTrackBySlug = new Map(
      existingTracks.map((track) => [track.slug, track]),
    );
    const incomingSlugs = new Set<string>();

    for (const song of songs ?? []) {
      const trackData = buildTrackWriteData(song);
      const slug = String(trackData.slug ?? "").trim();
      if (!slug) continue;
      incomingSlugs.add(slug);

      const relationData = {
        tags: {
          set: trackData.tagIds.map((id: number) => ({ id })),
        },
        flags: {
          set: trackData.flagIds.map((id: number) => ({ id })),
        },
        links: {
          deleteMany: {},
          create: trackData.links,
        },
        credits: {
          deleteMany: {},
          create: trackData.credits,
        },
      };

      const existingTrack = existingTrackBySlug.get(slug);
      if (existingTrack) {
        await db.gamePageTrack.update({
          where: { id: existingTrack.id },
          data: {
            name: trackData.name,
            slug: trackData.slug,
            url: trackData.url,
            commentary: trackData.commentary,
            bpm: trackData.bpm,
            musicalKey: trackData.musicalKey,
            softwareUsed: trackData.softwareUsed,
            license: trackData.license,
            allowDownload: trackData.allowDownload,
            allowBackgroundUse: trackData.allowBackgroundUse,
            allowBackgroundUseAttribution:
              trackData.allowBackgroundUseAttribution,
            composerId: trackData.composerId,
            ...relationData,
          },
        });
        continue;
      }

      await db.gamePageTrack.create({
        data: {
          gamePageId: pageId,
          name: trackData.name,
          slug: trackData.slug,
          url: trackData.url,
          commentary: trackData.commentary,
          bpm: trackData.bpm,
          musicalKey: trackData.musicalKey,
          softwareUsed: trackData.softwareUsed,
          license: trackData.license,
          allowDownload: trackData.allowDownload,
          allowBackgroundUse: trackData.allowBackgroundUse,
          allowBackgroundUseAttribution:
            trackData.allowBackgroundUseAttribution,
          composer: {
            connect: {
              id: trackData.composerId,
            },
          },
          tags: {
            connect: trackData.tagIds.map((id: number) => ({ id })),
          },
          flags: {
            connect: trackData.flagIds.map((id: number) => ({ id })),
          },
          links: {
            create: trackData.links,
          },
          credits: {
            create: trackData.credits,
          },
        },
      });
    }

    for (const existingTrack of existingTracks) {
      if (incomingSlugs.has(existingTrack.slug)) continue;
      if (
        existingTrack.ratings.length > 0 ||
        existingTrack.timestampComments.length > 0
      ) {
        continue;
      }

      await db.gamePageTrack.delete({
        where: { id: existingTrack.id },
      });
    }
  };

  const relationData = {
    ratingCategories: (body.ratingCategories ?? []).map((id: number) => ({
      id,
    })),
    majRatingCategories: (body.majRatingCategories ?? []).map((id: number) => ({
      id,
    })),
    flags: (body.flags ?? []).map((id: number) => ({ id })),
    tags: (body.tags ?? []).map((id: number) => ({ id })),
  };

  const baseData = {
    ...pagePayload,
    ratingCategories: existingPage
      ? {
          set: [],
          connect: relationData.ratingCategories,
        }
      : {
          connect: relationData.ratingCategories,
        },
    majRatingCategories: existingPage
      ? {
          set: [],
          connect: relationData.majRatingCategories,
        }
      : {
          connect: relationData.majRatingCategories,
        },
    flags: existingPage
      ? {
          set: [],
          connect: relationData.flags,
        }
      : {
          connect: relationData.flags,
        },
    tags: existingPage
      ? {
          set: [],
          connect: relationData.tags,
        }
      : {
          connect: relationData.tags,
        },
    downloadLinks: existingPage
      ? {
          deleteMany: {},
          create: (body.downloadLinks ?? []).map((link: any) => ({
            url: link.url,
            platform: link.platform,
          })),
        }
      : {
          create: (body.downloadLinks ?? []).map((link: any) => ({
            url: link.url,
            platform: link.platform,
          })),
        },
    leaderboards: existingPage
      ? {
          deleteMany: {},
          create: (body.leaderboards ?? []).map((leaderboard: any) => ({
            type: leaderboard.type,
            name: leaderboard.name,
            onlyBest: leaderboard.onlyBest,
            maxUsersShown: leaderboard.maxUsersShown,
            decimalPlaces: leaderboard.decimalPlaces,
          })),
        }
      : {
          create: (body.leaderboards ?? []).map((leaderboard: any) => ({
            type: leaderboard.type,
            name: leaderboard.name,
            onlyBest: leaderboard.onlyBest,
            maxUsersShown: leaderboard.maxUsersShown,
            decimalPlaces: leaderboard.decimalPlaces,
          })),
        },
    achievements: existingPage
      ? {
          deleteMany: {},
          create: (body.achievements ?? []).map((achievement: any) => ({
            name: achievement.name,
            description: achievement.description || "",
            image: achievement.image || "",
          })),
        }
      : {
          create: (body.achievements ?? []).map((achievement: any) => ({
            name: achievement.name,
            description: achievement.description || "",
            image: achievement.image || "",
          })),
        },
    tracks: existingPage
      ? undefined
      : {
          create: (body.songs ?? []).map((song: any) => {
            const trackData = buildTrackWriteData(song);
            return {
              name: trackData.name,
              slug: trackData.slug,
              url: trackData.url,
              commentary: trackData.commentary,
              bpm: trackData.bpm,
              musicalKey: trackData.musicalKey,
              softwareUsed: trackData.softwareUsed,
              license: trackData.license,
              allowDownload: trackData.allowDownload,
              allowBackgroundUse: trackData.allowBackgroundUse,
              allowBackgroundUseAttribution:
                trackData.allowBackgroundUseAttribution,
              composer: {
                connect: {
                  id: trackData.composerId,
                },
              },
              tags: {
                connect: trackData.tagIds.map((id: number) => ({ id })),
              },
              flags: {
                connect: trackData.flagIds.map((id: number) => ({ id })),
              },
              links: {
                create: trackData.links,
              },
              credits: {
                create: trackData.credits,
              },
            };
          }),
        },
  };

  if (existingPage) {
    await db.gamePage.update({
      where: { id: existingPage.id },
      data: baseData,
      include: postJamPageInclude,
    });

    await syncGamePageTracks(existingPage.id, body.songs ?? []);
    return db.gamePage.findUnique({
      where: { id: existingPage.id },
      include: postJamPageInclude,
    });
  }

  return db.gamePage.create({
    data: {
      ...baseData,
      version,
      game: {
        connect: { id: gameId },
      },
    },
    include: postJamPageInclude,
  });
}

async function buildVersionScores({
  game,
  version,
}: {
  game: any;
  version: PageVersion;
}) {
  const scores: Record<
    string,
    {
      placement?: number;
      averageScore?: number;
      ratingCount?: number;
      averageUnrankedScore?: number;
    }
  > = {};

  const games = await db.game.findMany({
    where: {
      jamId: game.jamId,
      category: game.category,
      published: true,
    },
    include: {
      ratingCategories: true,
      majRatingCategories: true,
      pages: {
        where: {
          version,
        },
        include: {
          ratingCategories: true,
          majRatingCategories: true,
        },
      },
      team: {
        select: {
          users: {
            select: {
              ratings: {
                select: {
                  gamePage: {
                    select: {
                      version: true,
                      gameId: true,
                      ratingCategories: {
                        select: {
                          id: true,
                        },
                      },
                      game: {
                        select: {
                          ratingCategories: {
                            select: {
                              id: true,
                            },
                          },
                          pages: {
                            where: {
                              version,
                            },
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
            },
          },
        },
      },
      ratings: {
        select: {
          value: true,
          categoryId: true,
          gamePage: {
            select: {
              version: true,
              gameId: true,
              game: {
                select: {
                  jamId: true,
                  category: true,
                  published: true,
                },
              },
            },
          },
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

  const allCategories = await db.ratingCategory.findMany();
  const categoriesById = new Map(
    allCategories.map((entry) => [entry.id, entry]),
  );
  const alwaysCategories = allCategories.filter((entry) => entry.always);

  const filteredGames = games.map((game2) => {
    const jamPage = getJamPage(game2);
    const postJamPage = getPostJamPage(game2);
    const selectedPage =
      version === PageVersion.POST_JAM ? postJamPage : jamPage;
    const selectedCategoryIds =
      selectedPage?.ratingCategories?.map((entry: any) => entry.id) ??
      game2.ratingCategories.map((entry) => entry.id);
    const selectedMajIds =
      selectedPage?.majRatingCategories?.map((entry: any) => entry.id) ??
      game2.majRatingCategories.map((entry) => entry.id);

    const selectedCategories = selectedCategoryIds
      .map((id: number) => categoriesById.get(id))
      .filter(Boolean);
    const categories = [
      ...selectedCategories,
      ...alwaysCategories.filter(
        (entry) => !selectedCategoryIds.includes(entry.id),
      ),
    ];
    const categoryIds = categories.map((entry) => entry.id);

    const filteredRatings = game2.ratings.filter(
      (rating) =>
        getRatingPageVersion(rating) === version &&
        categoryIds.includes(rating.categoryId),
    );

    const publishedRatings = filteredRatings.filter((rating) =>
      rating.user.teams.some((team) => {
        const candidateGame = team.game;
        return (
          candidateGame &&
          candidateGame.published &&
          candidateGame.jamId === game.jamId &&
          candidateGame.category !== "EXTRA"
        );
      }),
    );

    const categoryAverages = categories
      .filter(
        (category) =>
          !category.askMajorityContent ||
          game2.category !== "REGULAR" ||
          !selectedCategoryIds.includes(category.id) ||
          selectedMajIds.includes(category.id),
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
            ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
              categoryRatings.length
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
      jamPage,
      postJamPage,
      categoryAverages,
      ratingsCount: game2.team.users.reduce((totalRatings, user) => {
        const userRatingCount = user.ratings.reduce((count, rating) => {
          if (getRatingPageVersion(rating) !== version) return count;
          const ratedGamePage = rating.gamePage;
          const ratedCategoryCount =
            ratedGamePage?.ratingCategories?.length ??
            ratedGamePage?.game?.ratingCategories?.length ??
            0;
          return count + 1 / (ratedCategoryCount + alwaysCategories.length);
        }, 0);
        return totalRatings + userRatingCount;
      }, 0),
    };
  });

  const versionFilteredGames = filteredGames.filter((entry) =>
    version === PageVersion.POST_JAM
      ? Boolean(entry.postJamPage)
      : Boolean(entry.jamPage),
  );

  const rankedGames = versionFilteredGames
    .filter((entry) => {
      const overallCategory = entry.categoryAverages.find(
        (avg: any) => avg.categoryName === "RatingCategory.Overall.Title",
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    })
    .filter((entry) => entry.ratingsCount >= 4.99);

  if (game.category !== "EXTRA") {
    rankedGames.forEach((entry) => {
      entry.categoryAverages.forEach((category: any) => {
        const rankedGamesInCategory = rankedGames
          .map((candidate) => {
            const categoryAvg = candidate.categoryAverages.find(
              (cat: any) => cat.categoryId === category.categoryId,
            );
            return {
              gameId: candidate.id,
              score: categoryAvg ? categoryAvg.averageScore : 0,
            };
          })
          .sort((a, b) => b.score - a.score);

        const gamePlacement = rankedGamesInCategory.findIndex(
          (rankedGame) => rankedGame.gameId === entry.id,
        );

        category.placement = gamePlacement + 1;
      });
    });
  }

  const rankedTarget = rankedGames.find((entry) => entry.id === game.id);
  if (rankedTarget) {
    rankedTarget.categoryAverages.forEach((category: any) => {
      if (category.ratingCount >= 5) {
        if (!scores[category.categoryName]) {
          scores[category.categoryName] = {};
        }
        scores[category.categoryName].placement = category.placement;
      }
    });
  }

  const target = versionFilteredGames.find((entry) => entry.id === game.id);
  if (target) {
    target.categoryAverages.forEach((category: any) => {
      if (!scores[category.categoryName]) {
        scores[category.categoryName] = {};
      }
      scores[category.categoryName].averageScore = category.averageScore;
      scores[category.categoryName].ratingCount = category.ratingCount;
      scores[category.categoryName].averageUnrankedScore =
        category.averageUnrankedScore;
    });
  }

  return scores;
}

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
    pageVersion,
  } = req.body;
  const targetPageVersion = pageVersionFromInput(pageVersion);

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
        downloadLinks: true,
        achievements: true,
        leaderboards: {
          include: {
            scores: true,
          },
        },
        pages: {
          where: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
          },
          include: postJamPageInclude,
        },
      },
    });

    if (!existingGame) {
      res.status(404).send("Game not found.");
      return;
    }

    const existingPostJamPage = getPostJamPage(existingGame);
    const currentVersionCategory = existingGame.category;

    if (
      targetPageVersion === PageVersion.JAM &&
      res.locals.jamPhase == "Rating" &&
      existingGame.category != category &&
      category != "EXTRA"
    ) {
      res.status(400).send("Can't update category outside of jamming period.");
      return;
    }

    if (
      (res.locals.jamPhase === "Post-Jam Refinement" ||
        res.locals.jamPhase === "Post-Jam Rating") &&
      currentVersionCategory !== category
    ) {
      res.status(400).send("Can't update category during post-jam phases.");
      return;
    }

    if (targetPageVersion === PageVersion.POST_JAM) {
      await upsertGamePage(existingGame.id, PageVersion.POST_JAM, req.body);
      const updatedGame = await db.game.findUnique({
        where: { slug: gameSlug },
        include: {
          pages: {
            where: {
              version: {
                in: [PageVersion.JAM, PageVersion.POST_JAM],
              },
            },
            include: postJamPageInclude,
          },
        },
      });
      res.json(updatedGame);
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
        slug,
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
        beforeContent: getJamPage(existingGame)?.description ?? "",
        afterContent: description,
        gameId: updatedGame.id,
        gameSlug: updatedGame.slug,
        gameName: name,
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

    await upsertGamePage(updatedGame.id, PageVersion.JAM, req.body);

    res.json(updatedGame);
  } catch (error) {
    console.error("Error updating game:", error);
    res.status(500).send("Internal server error.");
  }
});

router.post("/:gameSlug/post-jam", getJam, async function (req, res) {
  const { gameSlug } = req.params;

  try {
    const existingGame = await db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        ratingCategories: true,
        majRatingCategories: true,
        tags: true,
        flags: true,
        achievements: true,
        leaderboards: true,
        downloadLinks: true,
        pages: {
          where: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
          },
          include: postJamPageInclude,
        },
      },
    });

    if (!existingGame) {
      res.status(404).send("Game not found.");
      return;
    }

    if (!getPostJamPage(existingGame)) {
      await upsertGamePage(
        existingGame.id,
        PageVersion.POST_JAM,
        buildPostJamBodyFromGame(existingGame),
      );
      const updatedGame = await db.game.findUnique({
        where: { slug: gameSlug },
        include: {
          pages: {
            where: {
              version: {
                in: [PageVersion.JAM, PageVersion.POST_JAM],
              },
            },
            include: postJamPageInclude,
          },
        },
      });

      res.json(updatedGame);
      return;
    }

    res.json(existingGame);
  } catch (error) {
    console.error("Error creating post-jam page:", error);
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
        gameEmotes: {
          include: {
            artistUser: true,
            ownerGame: {
              select: {
                id: true,
                slug: true,
                pages: {
                  where: { version: "JAM" },
                  select: { name: true, thumbnail: true },
                  take: 1,
                },
              },
            },
            uploaderUser: true,
          },
        },
        pages: {
          where: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
          },
          include: postJamPageInclude,
        },
        team: {
          include: {
            owner: true,
            users: {
              include: {
                ratings: {
                  select: {
                    gamePage: {
                      select: {
                        version: true,
                        gameId: true,
                        ratingCategories: {
                          select: {
                            id: true,
                          },
                        },
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
          },
        },
        ratings: {
          include: {
            category: true,
            gamePage: {
              select: {
                id: true,
                version: true,
                gameId: true,
              },
            },
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
    const jamPage = getJamPage(game);
    const postJamPage = getPostJamPage(game);
    const jamPageCommentsWithHasLiked = mapCommentsForViewer(
      jamPage?.comments ?? [],
      res.locals.user?.id ?? null,
      isPrivilegedViewer(res.locals.user),
    );
    const postJamPageCommentsWithHasLiked = mapCommentsForViewer(
      postJamPage?.comments ?? [],
      res.locals.user?.id ?? null,
      isPrivilegedViewer(res.locals.user),
    );

    // Ratings info

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

    let jamScores = {};
    let postJamScores = {};

    if (
      !currentJamMatches ||
      isJamOver ||
      canViewRecapScores ||
      canPreviewScores
    ) {
      jamScores = await buildVersionScores({
        game,
        version: PageVersion.JAM,
      });

      if (postJamPage && game.published) {
        postJamScores = await buildVersionScores({
          game,
          version: PageVersion.POST_JAM,
        });
      }
    }

    const normalizedRatings = (game.ratings ?? []).map((rating: any) => ({
      ...rating,
      gameId: rating.gamePage?.gameId ?? game.id,
      gamePageId: rating.gamePage?.id ?? null,
      pageVersion: getRatingPageVersion(rating),
    }));

    const normalizedTeam = {
      ...game.team,
      users: (game.team?.users ?? []).map((teamUser: any) => ({
        ...teamUser,
        ratings: (teamUser.ratings ?? []).map((rating: any) => ({
          ...rating,
          gameId: rating.gamePage?.gameId ?? null,
          gamePageId: rating.gamePage?.id ?? null,
          pageVersion: getRatingPageVersion(rating),
          game: rating.gamePage?.game ?? rating.game ?? null,
        })),
      })),
    };

    res.json({
      ...game,
      achievements: jamPage?.achievements ?? [],
      gameEmotes: (game.gameEmotes ?? []).map((emoji: any) => ({
        ...emoji,
        ownerGame: emoji.ownerGame
          ? {
              ...emoji.ownerGame,
              name: emoji.ownerGame.pages?.[0]?.name ?? emoji.ownerGame.slug,
              thumbnail: emoji.ownerGame.pages?.[0]?.thumbnail ?? null,
            }
          : null,
      })),
      team: normalizedTeam,
      ratings: normalizedRatings,
      jamPage: jamPage
        ? { ...jamPage, comments: jamPageCommentsWithHasLiked }
        : null,
      postJamPage: postJamPage
        ? { ...postJamPage, comments: postJamPageCommentsWithHasLiked }
        : null,
      comments: commentsWithHasLiked,
      jamScores,
      postJamScores,
    });
  },
);

router.get("/", async function (req: Request, res: Response) {
  const { sort, jamId } = req.query;
  const listingPageVersion = parseListingPageVersion(req.query.pageVersion);
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
    case "score":
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
      pages: {
        where: {
          version: {
            in: [PageVersion.JAM, PageVersion.POST_JAM],
          },
        },
        include: postJamPageInclude,
      },
      ratings: {
        select: {
          id: true,
          value: true,
          userId: true,
          categoryId: true,
          gameId: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          gamePage: {
            select: {
              version: true,
            },
          },
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
                  gamePage: {
                    select: {
                      version: true,
                    },
                  },
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

  game = game.flatMap((entry: any) => {
    const jamPage = getJamPage(entry);
    const postJamPage = getPostJamPage(entry);

    return getListingVersions(entry, listingPageVersion).map((version) => {
      const materialized = materializeGamePage(entry, version);

      return {
        ...materialized,
        pageVersion: version,
        jamPage,
        postJamPage,
        ratings: (entry.ratings ?? []).filter(
          (rating: any) =>
            (rating.gamePage?.version ?? PageVersion.JAM) === version,
        ),
        team: entry.team
          ? {
              ...entry.team,
              users: (entry.team.users ?? []).map((user: any) => ({
                ...user,
                ratings: (user.ratings ?? []).filter(
                  (rating: any) =>
                    (rating.gamePage?.version ?? PageVersion.JAM) === version,
                ),
              })),
            }
          : entry.team,
      };
    });
  });

  const ratingCategories = await db.ratingCategory.findMany({
    where: {
      always: true,
    },
  });

  if (sort === "random") {
    game = game.sort(() => Math.random() - 0.5);
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

  if (sort === "score") {
    const getOverallRatings = (g: (typeof game)[number]) =>
      g.ratings.filter((rating) => {
        const numericValue = Number(rating.value);
        return (
          rating.category?.name === "RatingCategory.Overall.Title" &&
          Number.isFinite(numericValue) &&
          isAllowedRaterInJam(rating, g.jamId)
        );
      });

    const getScoreSortAverage = (g: (typeof game)[number]) => {
      const overallRatings = getOverallRatings(g);
      if (overallRatings.length === 0) return SCORE_SORT_MIDPOINT;

      return (
        overallRatings.reduce((sum, rating) => sum + Number(rating.value), 0) /
        overallRatings.length
      );
    };

    const getScoreSortAdjusted = (g: (typeof game)[number]) => {
      const count = getOverallRatings(g).length;
      const average = getScoreSortAverage(g);
      const weight =
        Math.min(count, SCORE_SORT_RATING_GOAL) / SCORE_SORT_RATING_GOAL;

      return SCORE_SORT_MIDPOINT + (average - SCORE_SORT_MIDPOINT) * weight;
    };

    const getScoreSortCount = (g: (typeof game)[number]) =>
      getOverallRatings(g).length;

    game = game.sort((a, b) => {
      return (
        getScoreSortAdjusted(b) - getScoreSortAdjusted(a) ||
        getScoreSortAverage(b) - getScoreSortAverage(a) ||
        getScoreSortCount(b) - getScoreSortCount(a) ||
        b.id - a.id
      );
    });
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
    const pageVersions = [
      ...new Set(game.map((entry) => entry.pageVersion ?? PageVersion.JAM)),
    ];
    const overallCategoryId =
      ratingCategories.find(
        (category) => category.name === "RatingCategory.Overall.Title",
      )?.id ?? null;
    const recommendationKeyFor = (gameId: number, version: PageVersion) =>
      `${gameId}:${version}`;

    const recommendedPointsByGameId = new Map<string, number>();

    if (overallCategoryId && jamIds.length > 0) {
      const recommendationRatings = await db.rating.findMany({
        where: {
          game: {
            jamId: { in: jamIds },
          },
          gamePage: {
            version: { in: pageVersions },
          },
        },
        select: {
          gameId: true,
          userId: true,
          categoryId: true,
          value: true,
          updatedAt: true,
          gamePage: {
            select: {
              version: true,
            },
          },
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
          pageVersion: PageVersion;
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
          pageVersion: rating.gamePage?.version ?? PageVersion.JAM,
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
            itemId: recommendationKeyFor(entry.gameId, entry.pageVersion),
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
              (entry) =>
                recommendationKeyFor(entry.gameId, entry.pageVersion) ===
                  gameId && jamIds.includes(entry.jamId),
            ),
          )
          .forEach((entryKey) => {
            const current = recommendedPointsByGameId.get(entryKey) ?? 0;
            recommendedPointsByGameId.set(entryKey, current + 1);
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
      const points =
        recommendedPointsByGameId.get(
          recommendationKeyFor(g.id, g.pageVersion ?? PageVersion.JAM),
        ) ?? 0;
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
