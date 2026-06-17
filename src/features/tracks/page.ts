import { PageVersion } from "@prisma/client";
import { materializeGamePage } from "../games/page.helpers.js";

export function parseTrackPageVersion(value: unknown): PageVersion {
  return value === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;
}

type MaterializableTrack = {
  gamePage?: {
    version?: PageVersion | null;
    gameId?: number | null;
    name?: string | null;
    description?: string | null;
    short?: string | null;
    thumbnail?: string | null;
    banner?: string | null;
    screenshots?: string[];
    trailerUrl?: string | null;
    itchEmbedUrl?: string | null;
    itchEmbedAspectRatio?: string | null;
    game?: Record<string, unknown>;
  } | null;
} & Record<string, unknown>;

export function materializeTrackPage<TTrack extends MaterializableTrack>(track: TTrack) {
  const version = track?.gamePage?.version ?? PageVersion.JAM;
  const pageBackedGame = track?.gamePage?.game
    ? materializeGamePage(track.gamePage.game, version)
    : null;
  const game =
    pageBackedGame && track?.gamePage
      ? {
          ...pageBackedGame,
          name: pageBackedGame.name ?? track.gamePage.name ?? null,
          description:
            pageBackedGame.description ?? track.gamePage.description ?? null,
          short: pageBackedGame.short ?? track.gamePage.short ?? null,
          thumbnail: pageBackedGame.thumbnail ?? track.gamePage.thumbnail ?? null,
          banner: pageBackedGame.banner ?? track.gamePage.banner ?? null,
          screenshots:
            pageBackedGame.screenshots ?? track.gamePage.screenshots ?? [],
          trailerUrl:
            pageBackedGame.trailerUrl ?? track.gamePage.trailerUrl ?? null,
          itchEmbedUrl:
            pageBackedGame.itchEmbedUrl ?? track.gamePage.itchEmbedUrl ?? null,
          itchEmbedAspectRatio:
            pageBackedGame.itchEmbedAspectRatio ??
            track.gamePage.itchEmbedAspectRatio ??
            null,
        }
      : pageBackedGame;

  return {
    ...track,
    pageVersion: version,
    gameId: track?.gamePage?.gameId ?? game?.id ?? null,
    game,
  };
}
