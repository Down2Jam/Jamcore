import { PageVersion } from "@prisma/client";
import { materializeGamePage } from "@helper/gamePages";

export function parseTrackPageVersion(value: unknown): PageVersion {
  return value === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;
}

export function materializeTrackPage(track: any) {
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
