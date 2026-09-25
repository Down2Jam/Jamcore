import db from "../../infra/db.js";
import {
  applyRecommendationOverrides,
} from "./recommendations.core.js";
import {
  gameSummarySelect,
  trackSummarySelect,
} from "../../prisma/selects.js";
import { getRecommendationContext } from "./recommendation.context.js";
import {
  buildFavoriteCounts,
  buildGameRecommendationBase,
  buildTrackRecommendationBase,
  buildUserRecommendationBase,
} from "./recommendation.service.js";
import {
  loadRawTargetUser,
  loadRecommendationUsers,
} from "./target.queries.js";

export async function loadTargetUserRecommendations({
  targetUserId,
  targetUserSlug,
}: {
  targetUserId?: number;
  targetUserSlug?: string;
}) {
  const [recommendationContext, user] = await Promise.all([
    getRecommendationContext(),
    loadRawTargetUser(targetUserId, targetUserSlug),
  ]);
  if (!user) {
    return null;
  }

  const { overallGameCategoryId, overallTrackCategoryId, activeJamId } =
    recommendationContext;

  const { ratings, gameAverageById, trackAverageById } =
    buildUserRecommendationBase(user, activeJamId);

  const gameRecommendationBase = buildGameRecommendationBase(
    ratings,
    overallGameCategoryId,
    activeJamId,
    gameAverageById,
  );

  const trackRecommendationBase = buildTrackRecommendationBase(
    user.trackRatings ?? [],
    overallTrackCategoryId,
    activeJamId,
    trackAverageById,
  );

  const [validGameOverrides, validTrackOverrides] = activeJamId == null
    ? [user.recommendedGameOverrideIds ?? [], user.recommendedTrackOverrideIds ?? []]
    : await Promise.all([
        db.game.findMany({
          where: {
            id: { in: user.recommendedGameOverrideIds ?? [] },
            jamId: activeJamId,
            published: true,
          },
          select: { id: true },
        }).then((games) => games.map((game) => game.id)),
        db.gamePageTrack.findMany({
          where: {
            id: { in: user.recommendedTrackOverrideIds ?? [] },
            origin: "ORIGINAL",
            gamePage: {
              version: "JAM",
              game: { jamId: activeJamId, published: true },
            },
          },
          select: { id: true },
        }).then((tracks) => tracks.map((track) => track.id)),
      ]);
  const gameOverrideSet = new Set(validGameOverrides);
  const trackOverrideSet = new Set(validTrackOverrides);
  const currentGameOverrides = (user.recommendedGameOverrideIds ?? [])
    .filter((id) => gameOverrideSet.has(id));
  const currentTrackOverrides = (user.recommendedTrackOverrideIds ?? [])
    .filter((id) => trackOverrideSet.has(id));

  const recommendedGameIds = gameRecommendationBase.eligible
    ? applyRecommendationOverrides(
        gameRecommendationBase.candidateIds,
        currentGameOverrides,
        user.recommendedGameHiddenIds ?? [],
      )
    : [];
  const recommendedTrackIds = trackRecommendationBase.eligible
    ? applyRecommendationOverrides(
        trackRecommendationBase.candidateIds,
        currentTrackOverrides,
        user.recommendedTrackHiddenIds ?? [],
      )
    : [];

  const ownedGameIds = (user.teams ?? [])
    .map((team: any) => team.game?.id)
    .filter((id: unknown): id is number => Number.isInteger(id));
  const ownedTrackIds = (user.gamePageTracks ?? [])
    .map((track: any) => track.id)
    .filter((id: unknown): id is number => Number.isInteger(id));

  const [gameCandidates, recommendedGames, trackCandidates, recommendedTracks, recommendationUsers] =
    await Promise.all([
      gameRecommendationBase.candidateIds.length > 0
        ? db.game.findMany({
            where: { id: { in: gameRecommendationBase.candidateIds } },
            select: gameSummarySelect,
          })
        : Promise.resolve([]),
      recommendedGameIds.length > 0
        ? db.game.findMany({
            where: { id: { in: recommendedGameIds } },
            select: gameSummarySelect,
          })
        : Promise.resolve([]),
      trackRecommendationBase.candidateIds.length > 0
        ? db.gamePageTrack.findMany({
            where: { id: { in: trackRecommendationBase.candidateIds }, origin: "ORIGINAL" },
            select: trackSummarySelect,
          })
        : Promise.resolve([]),
      recommendedTrackIds.length > 0
        ? db.gamePageTrack.findMany({
            where: { id: { in: recommendedTrackIds }, origin: "ORIGINAL" },
            select: trackSummarySelect,
          })
        : Promise.resolve([]),
      ownedGameIds.length > 0 || ownedTrackIds.length > 0
        ? loadRecommendationUsers(user.id, activeJamId)
        : Promise.resolve([]),
    ]);

  const { favoriteGameCounts, favoriteTrackCounts } = buildFavoriteCounts({
    recommendationUsers,
    overallGameCategoryId,
    overallTrackCategoryId,
    ownedGameIds,
    ownedTrackIds,
  });

  return {
    user: {
      ...user,
      recommendedGameOverrideIds: currentGameOverrides,
      recommendedTrackOverrideIds: currentTrackOverrides,
    },
    ratings,
    gameCandidates,
    recommendedGames,
    trackCandidates,
    recommendedTracks,
    gameCandidateIds: gameRecommendationBase.candidateIds,
    recommendedGameIds,
    trackCandidateIds: trackRecommendationBase.candidateIds,
    recommendedTrackIds,
    gameCandidateCount: gameRecommendationBase.ratedCount,
    trackCandidateCount: trackRecommendationBase.ratedCount,
    favoriteGameCounts,
    favoriteTrackCounts,
  };
}
