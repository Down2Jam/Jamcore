import { PageVersion } from "@prisma/client";

import type { GamePageRecord, GameWithPages } from "../../types/game.js";
import { getJamPage, getPostJamPage, pageItemOrder } from "./page.helpers.js";

export const postJamPageInclude = {
  ratingCategories: true,
  majRatingCategories: true,
  tags: true,
  flags: true,
  downloadLinks: true,
  achievements: {
    include: {
      users: true,
      unlocks: { select: { userId: true, earnedAt: true } },
    },
  },
  leaderboards: {
    orderBy: pageItemOrder,
    include: {
      scores: {
        include: {
          user: true,
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
          children: true,
        },
      },
    },
  },
  tracks: {
    orderBy: pageItemOrder,
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

type PageVersionRef = { version: PageVersion };
type GamePageRef = { gamePage?: PageVersionRef | null };
type PageCollection<TPage extends PageVersionRef = GamePageRecord> =
  GameWithPages<TPage>;

export function getRatingPageVersion(rating: GamePageRef): PageVersion {
  return rating?.gamePage?.version === PageVersion.POST_JAM
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

export function buildPostJamBodyFromGame(game: PageCollection<GamePageRecord>) {
  const jamPage = getJamPage(game) ?? getPostJamPage(game);

  if (!jamPage) {
    return {
      name: "",
      description: "",
      short: "",
      thumbnail: null,
      soundtrackThumbnail: null,
      banner: null,
      pageBackground: null,
      screenshots: [],
      trailerUrl: null,
      itchEmbedUrl: null,
      itchEmbedAspectRatio: null,
      playableBuildUrl: null,
      playableBuildAspectRatio: null,
      playableBuildShowFullscreenButton: true,
      inputMethods: [],
      estOneRun: null,
      estAnyPercent: null,
      estHundredPercent: null,
      themeJustification: "",
      emotePrefix: null,
      ratingCategories: [],
      majRatingCategories: [],
      flags: [],
      tags: [],
      achievements: [],
      leaderboards: [],
      downloadLinks: [],
      songs: [],
    };
  }

  return {
    name: jamPage.name ?? "",
    description: jamPage.description ?? "",
    short: jamPage.short ?? "",
    thumbnail: jamPage.thumbnail ?? null,
    soundtrackThumbnail: jamPage.soundtrackThumbnail ?? null,
    banner: jamPage.banner ?? null,
    pageBackground: jamPage.pageBackground ?? null,
    screenshots: Array.isArray(jamPage.screenshots) ? jamPage.screenshots : [],
    trailerUrl: jamPage.trailerUrl ?? null,
    itchEmbedUrl: jamPage.itchEmbedUrl ?? null,
    itchEmbedAspectRatio: jamPage.itchEmbedAspectRatio ?? null,
    playableBuildUrl: jamPage.playableBuildUrl ?? null,
    playableBuildAspectRatio: jamPage.playableBuildAspectRatio ?? null,
    playableBuildShowFullscreenButton:
      jamPage.playableBuildShowFullscreenButton,
    inputMethods: Array.isArray(jamPage.inputMethods) ? jamPage.inputMethods : [],
    estOneRun: jamPage.estOneRun ?? null,
    estAnyPercent: jamPage.estAnyPercent ?? null,
    estHundredPercent: jamPage.estHundredPercent ?? null,
    themeJustification: jamPage.themeJustification ?? "",
    emotePrefix: jamPage.emotePrefix ?? null,
    ratingCategories: (jamPage.ratingCategories ?? []).map(
      (entry) => entry.id,
    ),
    majRatingCategories: (jamPage.majRatingCategories ?? []).map(
      (entry) => entry.id,
    ),
    flags: (jamPage.flags ?? []).map((entry) => entry.id),
    tags: (jamPage.tags ?? []).map((entry) => entry.id),
    achievements: [],
    leaderboards: [],
    downloadLinks: (jamPage.downloadLinks ?? []).map((entry) => ({
      url: entry.url,
      platform: entry.platform,
    })),
    songs: [],
  };
}

export { getJamPage, getPostJamPage } from "./page.helpers.js";
