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
  const { overallGameCategoryId, overallTrackCategoryId, activeJamId } =
    await getRecommendationContext();

  const user = await loadRawTargetUser(targetUserId, targetUserSlug);
  if (!user) {
    return null;
  }

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

  const recommendedGameIds = gameRecommendationBase.eligible
    ? applyRecommendationOverrides(
        gameRecommendationBase.candidateIds,
        user.recommendedGameOverrideIds ?? [],
        user.recommendedGameHiddenIds ?? [],
      )
    : [];
  const recommendedTrackIds = trackRecommendationBase.eligible
    ? applyRecommendationOverrides(
        trackRecommendationBase.candidateIds,
        user.recommendedTrackOverrideIds ?? [],
        user.recommendedTrackHiddenIds ?? [],
      )
    : [];

  const [gameCandidates, recommendedGames, trackCandidates, recommendedTracks] =
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
            where: { id: { in: trackRecommendationBase.candidateIds } },
            select: trackSummarySelect,
          })
        : Promise.resolve([]),
      recommendedTrackIds.length > 0
        ? db.gamePageTrack.findMany({
            where: { id: { in: recommendedTrackIds } },
            select: trackSummarySelect,
          })
        : Promise.resolve([]),
    ]);

  const ownedGameIds = (user.teams ?? [])
    .map((team: any) => team.game?.id)
    .filter((id: unknown): id is number => Number.isInteger(id));
  const ownedTrackIds = (user.gamePageTracks ?? [])
    .map((track: any) => track.id)
    .filter((id: unknown): id is number => Number.isInteger(id));

  const recommendationUsers =
    ownedGameIds.length > 0 || ownedTrackIds.length > 0
      ? await loadRecommendationUsers(user.id, activeJamId)
      : [];

  const { favoriteGameCounts, favoriteTrackCounts } = buildFavoriteCounts({
    recommendationUsers,
    overallGameCategoryId,
    overallTrackCategoryId,
    ownedGameIds,
    ownedTrackIds,
  });

  return {
    user,
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
