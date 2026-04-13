import { PageVersion } from "@prisma/client";
import { materializeGamePage } from "@helper/gamePages";

export function parseTrackPageVersion(value: unknown): PageVersion {
  return value === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;
}

export function materializeTrackPage(track: any) {
  const version = track?.gamePage?.version ?? PageVersion.JAM;
  const game = track?.gamePage?.game
    ? materializeGamePage(track.gamePage.game, version)
    : null;

  return {
    ...track,
    pageVersion: version,
    gameId: track?.gamePage?.gameId ?? game?.id ?? null,
    game,
  };
}
