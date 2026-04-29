import { PageVersion } from "@prisma/client";

import { materializeGamePage } from "./page.helpers.js";
import type {
  GameListingRecord,
  ListingPageVersion,
} from "../../types/gameListing.js";

export function getPostJamPage(game: Pick<GameListingRecord, "pages">) {
  return (
    game.pages?.find((page) => page.version === PageVersion.POST_JAM) ?? null
  );
}

export function getJamPage(game: Pick<GameListingRecord, "pages">) {
  return game.pages?.find((page) => page.version === PageVersion.JAM) ?? null;
}

export function parseListingPageVersion(value: unknown): ListingPageVersion {
  return value === "POST_JAM" || value === "ALL" ? value : PageVersion.JAM;
}

export function getListingVersions(
  game: Pick<GameListingRecord, "pages">,
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

export function materializeGameListingEntries(
  game: GameListingRecord,
  listingPageVersion: ListingPageVersion,
) {
  const jamPage = getJamPage(game);
  const postJamPage = getPostJamPage(game);

  return getListingVersions(game, listingPageVersion).map((version) => ({
    ...materializeGamePage(game, version),
    pageVersion: version,
    jamPage,
    postJamPage,
    allRatings: game.ratings ?? [],
    ratings: (game.ratings ?? []).filter(
      (rating) => (rating.gamePage?.version ?? PageVersion.JAM) === version,
    ),
    team: game.team
      ? {
          ...game.team,
          users: (game.team.users ?? []).map((user) => ({
            ...user,
            ratings: (user.ratings ?? []).filter(
              (rating) =>
                (rating.gamePage?.version ?? PageVersion.JAM) === version,
            ),
          })),
        }
      : game.team,
  }));
}
