import { z } from "zod";
import { PageVersion } from "@prisma/client";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { BadRequestError } from "../../lib/errors.js";
import { resolveJamReference } from "../jams/index.js";
import { materializeTrackPage } from "./page.js";
import { loadTrackCategories, loadTrackListingRecords, parseListingPageVersion } from "./queries.js";
import {
  sortDangerTracks,
  sortTracksByKarmaOrRecommendation,
  sortTracksByLeastRatings,
  sortTracksByRatingBalance,
  sortTracksByScore,
} from "./ranking.js";
import { listTracksQuerySchema } from "./schemas.js";

function getAllVersionsTrackKey(track: any) {
  return `${track.gameId ?? track.game?.id ?? track.gamePage?.gameId ?? "unknown"}:${
    track.sourceTrackId ?? track.slug ?? track.id
  }`;
}

function preferPostJamTracks(tracks: any[]) {
  const tracksByKey = new Map<string, any>();

  tracks.forEach((track) => {
    const key = getAllVersionsTrackKey(track);
    const existing = tracksByKey.get(key);
    if (!existing || track.pageVersion === PageVersion.POST_JAM) {
      tracksByKey.set(key, track);
    }
  });

  return [...tracksByKey.values()];
}

export async function listTracks(
  input: z.infer<typeof listTracksQuerySchema>,
  tenantId?: string | null,
) {
  const jamSlugParam = input.jamSlug?.trim();
  const jamIdParam = input.jamId?.trim();
  const sort = input.sort?.trim() ?? "random";
  const listingPageVersion = parseListingPageVersion(input.pageVersion);

  if (
    !jamSlugParam &&
    jamIdParam &&
    jamIdParam !== "all" &&
    Number.isNaN(Number(jamIdParam))
  ) {
    throw new BadRequestError("Invalid jamId");
  }

  const wantsAllTracks = jamIdParam === "all";
  const resolvedJam =
    !wantsAllTracks && (jamSlugParam || jamIdParam)
      ? await resolveJamReference({
          jamId: jamIdParam ?? null,
          jamSlug: jamSlugParam ?? null,
        })
      : null;

  let tracks = await loadTrackListingRecords({
    jamId: resolvedJam?.id,
    listingPageVersion,
    sort,
  });

  const allowedGameIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: tracks
        .map((track) => track.gamePage?.game?.id)
        .filter((id): id is number => Number.isInteger(id)),
      tenantId,
    }),
  );
  tracks = tracks.filter((track) => {
    const gameId = track.gamePage?.game?.id;
    return Number.isInteger(gameId) && allowedGameIds.has(gameId);
  });

  tracks = tracks.map((track) => materializeTrackPage(track));
  if (listingPageVersion === "ALL") {
    tracks = preferPostJamTracks(tracks);
  }

  const trackCategories = await loadTrackCategories();
  const categoryCount = Math.max(trackCategories.length, 1);

  if (sort === "random") {
    tracks = tracks.sort(() => Math.random() - 0.5);
  }

  if (sort === "score") {
    tracks = sortTracksByScore(tracks);
  }

  if (sort === "leastratings") {
    tracks = sortTracksByLeastRatings(tracks, categoryCount);
  }

  if (sort === "danger") {
    tracks = sortDangerTracks(tracks, categoryCount);
  }

  if (sort === "ratingbalance") {
    tracks = sortTracksByRatingBalance(tracks, categoryCount);
  }

  if (sort === "karma" || sort === "recommended") {
    tracks = await sortTracksByKarmaOrRecommendation({
      tracks,
      categoryCount,
      sort,
      trackCategories,
    });
  }

  return {
    message:
      jamSlugParam || (jamIdParam && jamIdParam !== "all")
        ? `Fetched tracks for jam ${resolvedJam?.slug ?? jamSlugParam ?? jamIdParam}`
        : "Fetched tracks",
    data: tracks,
  };
}
