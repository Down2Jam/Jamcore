import { PageVersion } from "@prisma/client";
import { loadCommentDescendants } from "../comments/load-tree.js";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "../comments/thread.service.js";
import { listRemoteCommentsForTarget } from "../federation/remote-content.service.js";
import { materializeTrackPage, parseTrackPageVersion } from "./page.js";
import {
  loadTrackCategories,
  loadTrackDetailCandidates,
  loadTrackScoreRecords,
} from "./queries.js";
import { buildTrackDetailScores } from "./ranking.js";
import type { TrackViewer } from "./schemas.js";

export async function getRandomTrack(tenantId?: string | null) {
  const track = await db.$queryRaw<
    { slug: string; gameId: number }[]
  >`
    WITH active_jams AS (
      SELECT j.id
      FROM "Jam" j
      WHERE NOW() >= j."startTime"
        AND NOW() < j."startTime"
          + (COALESCE(j."jammingHours", 0)
             + COALESCE(j."submissionHours", 0)
             + COALESCE(j."ratingHours", 0)) * INTERVAL '1 hour'
    )
    SELECT t.slug, g.id AS "gameId"
    FROM "GamePageTrack" t
    JOIN "GamePage" gp ON gp.id = t."gamePageId"
    JOIN "Game" g ON g.id = gp."gameId"
    WHERE g."published" = TRUE
      AND (
        NOT EXISTS (SELECT 1 FROM active_jams)
        OR g."jamId" IN (SELECT id FROM active_jams)
      )
    ORDER BY RANDOM()
    LIMIT 1
  `;

  if (!track[0]) {
    return null;
  }

  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [track[0].gameId],
    tenantId,
  });

  if (!allowedIds.includes(track[0].gameId)) {
    return null;
  }

  return getTrackBySlug({
    trackSlug: track[0].slug,
    pageVersionInput: undefined,
    tenantId,
  });
}

export async function getTrackBySlug({
  trackSlug,
  pageVersionInput,
  viewer,
  tenantId,
}: {
  trackSlug: string;
  pageVersionInput: unknown;
  viewer?: TrackViewer;
  tenantId?: string | null;
}) {
  const requestedPageVersion =
    pageVersionInput === undefined
      ? undefined
      : parseTrackPageVersion(pageVersionInput);
  const matchingTracks = await loadTrackDetailCandidates(trackSlug);

  const preferredVersions = requestedPageVersion
    ? [requestedPageVersion]
    : [PageVersion.POST_JAM, PageVersion.JAM];
  const track =
    preferredVersions
      .map((version) =>
        matchingTracks.find((candidate) => candidate.gamePage?.version === version) ??
        (version === PageVersion.POST_JAM
          ? matchingTracks.find((candidate) => candidate.gamePage.game.pages.some(
              (page) => page.version === PageVersion.POST_JAM,
            ))
          : undefined),
      )
      .find(Boolean) ?? null;

  if (!track || !track.gamePage?.game?.published) {
    throw new NotFoundError("Track not found");
  }

  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [track.gamePage.game.id],
    tenantId,
  });
  if (!allowedIds.includes(track.gamePage.game.id)) {
    throw new NotFoundError("Track not found");
  }

  const postJamPage = track.gamePage.game.pages.find(
    (page) => page.version === PageVersion.POST_JAM,
  );
  const displayedVersion = requestedPageVersion ??
    (postJamPage ? PageVersion.POST_JAM : track.gamePage.version);
  const displayedTrack = displayedVersion === PageVersion.POST_JAM && postJamPage
    ? { ...track, gamePage: { ...postJamPage, game: track.gamePage.game } }
    : track;
  const materializedTrack = materializeTrackPage(displayedTrack);
  const materializedGame = materializedTrack.game as
    | {
        jamId: number;
      }
    | null;
  if (!materializedGame) {
    throw new NotFoundError("Track game not found");
  }
  const scorePageVersion = displayedVersion;
  const availablePageVersions = ([PageVersion.JAM, PageVersion.POST_JAM] as const).filter(
    (version) =>
      (track.gamePage?.game?.pages ?? []).some(
        (page) =>
          page.version === version &&
          (version === PageVersion.POST_JAM ||
            (page.tracks ?? []).some((candidate) => candidate.slug === track.slug)),
      ),
  );

  const relatedTracks = matchingTracks.filter(
    (candidate) => candidate.gamePage.game.id === track.gamePage.game.id,
  );
  const commentsForVersion = (version: PageVersion) => relatedTracks.flatMap(
    (candidate) => candidate.comments.filter(
      (comment) => (comment.trackPageVersion ?? candidate.gamePage.version) === version,
    ),
  );
  const currentComments = commentsForVersion(displayedVersion);
  const originalComments = displayedVersion === PageVersion.POST_JAM
    ? commentsForVersion(PageVersion.JAM)
    : [];
  await loadCommentDescendants([...currentComments, ...originalComments]);
  const jamComments = mapCommentsForViewer(
    originalComments,
    viewer?.id ?? null,
    isPrivilegedViewer(viewer),
  );
  const visibleComments = mapCommentsForViewer(
    currentComments,
    viewer?.id ?? null,
    isPrivilegedViewer(viewer),
  );
  const remoteComments = await listRemoteCommentsForTarget({
    kind: "track",
    slug: track.slug,
    tenantId,
  });

  const viewerRating = track.ratings.find((rating) => rating.userId === viewer?.id) ?? null;
  const scoreTracks = await loadTrackScoreRecords({
    jamId: materializedGame.jamId,
    scorePageVersion,
  });
  const trackCategories = await loadTrackCategories();
  const scores = buildTrackDetailScores({
    scoreTracks,
    trackCategories,
    jamId: materializedGame.jamId,
    targetTrackId: track.id,
    scorePageVersion,
  });

  return {
    ...materializedTrack,
    availablePageVersions,
    comments: [...visibleComments, ...remoteComments],
    jamComments,
    viewerRating,
    scores,
  };
}
