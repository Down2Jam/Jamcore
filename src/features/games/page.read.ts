import { PageVersion } from "@prisma/client";

import type {
  GamePageRecord,
  GameWithPages,
} from "../../types/game.js";
import { getJamPage, getPostJamPage } from "./page.helpers.js";

export const postJamPageInclude = {
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
  leaderboards: {
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
      banner: null,
      screenshots: [],
      trailerUrl: null,
      itchEmbedUrl: null,
      itchEmbedAspectRatio: null,
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
    banner: jamPage.banner ?? null,
    screenshots: Array.isArray(jamPage.screenshots) ? jamPage.screenshots : [],
    trailerUrl: jamPage.trailerUrl ?? null,
    itchEmbedUrl: jamPage.itchEmbedUrl ?? null,
    itchEmbedAspectRatio: jamPage.itchEmbedAspectRatio ?? null,
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
    achievements: (jamPage.achievements ?? []).map((entry) => ({
      name: entry.name,
      description: entry.description ?? "",
      image: entry.image ?? "",
    })),
    leaderboards: (jamPage.leaderboards ?? []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      onlyBest: entry.onlyBest,
      maxUsersShown: entry.maxUsersShown,
      decimalPlaces: entry.decimalPlaces,
    })),
    downloadLinks: (jamPage.downloadLinks ?? []).map((entry) => ({
      url: entry.url,
      platform: entry.platform,
    })),
    songs: (jamPage.tracks ?? []).map((song) => ({
      name: song.name,
      slug: song.slug,
      url: song.url,
      commentary: song.commentary ?? null,
      tagIds: (song.tags ?? []).map((entry) => entry.id),
      flagIds: (song.flags ?? []).map((entry) => entry.id),
      bpm: song.bpm ?? null,
      musicalKey: song.musicalKey ?? null,
      softwareUsed: song.softwareUsed ?? [],
      links: (song.links ?? []).map((entry) => ({
        label: entry.label,
        url: entry.url,
      })),
      credits: (song.credits ?? []).map((entry) => ({
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

export { getJamPage, getPostJamPage } from "./page.helpers.js";
