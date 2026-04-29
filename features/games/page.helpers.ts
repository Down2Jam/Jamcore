import { PageVersion } from "@prisma/client";
import type { GamePageWriteBody, GameWithPages } from "../../types/game.js";

export const gamePageInclude = {
  ratingCategories: true,
  majRatingCategories: true,
  tags: true,
  flags: true,
  downloadLinks: true,
  achievements: true,
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

export function pageVersionFromInput(value?: string | null): PageVersion {
  return value === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;
}

type PageVersionRef = { version: PageVersion };

export function getGamePage<TPage extends PageVersionRef>(
  game: GameWithPages<TPage>,
  version: PageVersion,
) {
  return game?.pages?.find((page) => page.version === version) ?? null;
}

export function getJamPage<TPage extends PageVersionRef>(game: GameWithPages<TPage>) {
  return game?.jamPage ?? getGamePage(game, PageVersion.JAM);
}

export function getPostJamPage<TPage extends PageVersionRef>(
  game: GameWithPages<TPage>,
) {
  return game?.postJamPage ?? getGamePage(game, PageVersion.POST_JAM);
}

type MaterializableGamePage = {
  name?: string | null;
  description?: string | null;
  short?: string | null;
  thumbnail?: string | null;
  banner?: string | null;
  screenshots?: string[];
  trailerUrl?: string | null;
  itchEmbedUrl?: string | null;
  itchEmbedAspectRatio?: string | null;
  inputMethods?: string[];
  estOneRun?: string | null;
  estAnyPercent?: string | null;
  estHundredPercent?: string | null;
  themeJustification?: string | null;
  emotePrefix?: string | null;
  ratingCategories?: unknown[];
  majRatingCategories?: unknown[];
  flags?: unknown[];
  tags?: unknown[];
  downloadLinks?: unknown[];
  tracks?: unknown[];
  leaderboards?: unknown[];
  achievements?: unknown[];
  comments?: unknown[];
  ghosts?: unknown[];
  data?: unknown;
} & PageVersionRef;

export function materializeGamePage<TGame extends object, TPage extends MaterializableGamePage>(
  game: TGame & GameWithPages<TPage>,
  version: PageVersion = PageVersion.JAM,
) {
  const page =
    version === PageVersion.POST_JAM ? getPostJamPage(game) : getJamPage(game);

  if (!page) return game;

  return {
    ...game,
    name: page.name,
    description: page.description,
    short: page.short,
    thumbnail: page.thumbnail,
    banner: page.banner,
    screenshots: page.screenshots,
    trailerUrl: page.trailerUrl,
    itchEmbedUrl: page.itchEmbedUrl,
    itchEmbedAspectRatio: page.itchEmbedAspectRatio,
    inputMethods: page.inputMethods,
    estOneRun: page.estOneRun,
    estAnyPercent: page.estAnyPercent,
    estHundredPercent: page.estHundredPercent,
    themeJustification: page.themeJustification,
    emotePrefix: page.emotePrefix,
    ratingCategories: page.ratingCategories,
    majRatingCategories: page.majRatingCategories,
    flags: page.flags,
    tags: page.tags,
    downloadLinks: page.downloadLinks,
    tracks: page.tracks,
    leaderboards: page.leaderboards,
    achievements: page.achievements,
    comments: page.comments,
    ghosts: page.ghosts,
    data: page.data,
  };
}

export function buildGamePagePayload(body: GamePageWriteBody) {
  return {
    name: body?.name ?? "",
    description: body?.description ?? "",
    short: body?.short ?? "",
    thumbnail: body?.thumbnail ?? null,
    banner: body?.banner ?? null,
    screenshots: Array.isArray(body?.screenshots) ? body.screenshots : [],
    trailerUrl: body?.trailerUrl ?? null,
    itchEmbedUrl: body?.itchEmbedUrl ?? null,
    itchEmbedAspectRatio: body?.itchEmbedAspectRatio ?? null,
    inputMethods: Array.isArray(body?.inputMethods) ? body.inputMethods : [],
    estOneRun: body?.estOneRun ?? null,
    estAnyPercent: body?.estAnyPercent ?? null,
    estHundredPercent: body?.estHundredPercent ?? null,
    themeJustification: body?.themeJustification ?? "",
    emotePrefix: body?.emotePrefix ?? null,
  };
}
