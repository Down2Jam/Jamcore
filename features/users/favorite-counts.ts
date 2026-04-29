import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "./recommendations.core.js";
import type {
  FavoriteCountUser,
  FavoriteGameCount,
  FavoriteTrackCount,
} from "../../types/user.js";
import type {
  GameAverageMap,
  TrackAverageMap,
  TrackRatingLike,
} from "./recommendation.base.js";
import { getRatingPageVersion } from "./recommendation.base.js";

type RecommendationUser = {
  id: number;
  slug: string;
  name: string;
  profilePicture: string | null;
  recommendedGameOverrideIds: number[];
  recommendedGameHiddenIds: number[];
  recommendedTrackOverrideIds: number[];
  recommendedTrackHiddenIds: number[];
  ratings: Array<{
    gameId: number;
    categoryId: number;
    value: number;
    updatedAt: Date;
    gamePage?: { version?: any } | null;
  }>;
  trackRatings: TrackRatingLike[];
};

function toFavoriteCountUser(user: RecommendationUser): FavoriteCountUser {
  return {
    id: user.id,
    slug: user.slug,
    name: user.name,
    profilePicture: user.profilePicture,
  };
}

export function buildFavoriteCounts({
  recommendationUsers,
  overallGameCategoryId,
  overallTrackCategoryId,
  ownedGameIds,
  ownedTrackIds,
}: {
  recommendationUsers: RecommendationUser[];
  overallGameCategoryId: number | null;
  overallTrackCategoryId: number | null;
  ownedGameIds: number[];
  ownedTrackIds: number[];
}): {
  favoriteGameCounts: FavoriteGameCount[];
  favoriteTrackCounts: FavoriteTrackCount[];
} {
  const favoriteGameCountMap = new Map(
    ownedGameIds.map((gameId) => [
      gameId,
      { count: 0, users: [] as FavoriteCountUser[] },
    ]),
  );
  const favoriteTrackCountMap = new Map(
    ownedTrackIds.map((trackId) => [
      trackId,
      { count: 0, users: [] as FavoriteCountUser[] },
    ]),
  );

  recommendationUsers.forEach((recommendationUser) => {
    if (overallGameCategoryId) {
      const jamRatings = recommendationUser.ratings
        .map((rating) => ({
          ...rating,
          pageVersion: getRatingPageVersion(rating),
        }))
        .filter((rating) => rating.pageVersion === "JAM");

      const gameAverageById = jamRatings.reduce<GameAverageMap>((acc, rating) => {
        const current = acc.get(rating.gameId) ?? { total: 0, count: 0 };
        current.total += rating.value;
        current.count += 1;
        acc.set(rating.gameId, current);
        return acc;
      }, new Map());

      const recommendationBase = rankRecommendationCandidates(
        jamRatings
          .filter((rating) => rating.categoryId === overallGameCategoryId)
          .map((rating) => ({
            itemId: rating.gameId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = gameAverageById.get(rating.gameId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          })),
      );

      const effectiveGameIds = recommendationBase.eligible
        ? applyRecommendationOverrides(
            recommendationBase.candidateIds,
            recommendationUser.recommendedGameOverrideIds ?? [],
            recommendationUser.recommendedGameHiddenIds ?? [],
          )
        : [];

      effectiveGameIds.forEach((gameId) => {
        const current = favoriteGameCountMap.get(gameId);
        if (!current) return;
        current.count += 1;
        if (current.users.length < 5) {
          current.users.push(toFavoriteCountUser(recommendationUser));
        }
      });
    }

    if (overallTrackCategoryId) {
      const trackAverageById = recommendationUser.trackRatings.reduce<TrackAverageMap>(
        (acc, rating) => {
          const current = acc.get(rating.trackId) ?? { total: 0, count: 0 };
          current.total += rating.value;
          current.count += 1;
          acc.set(rating.trackId, current);
          return acc;
        },
        new Map(),
      );

      const recommendationBase = rankRecommendationCandidates(
        recommendationUser.trackRatings
          .filter((rating) => rating.categoryId === overallTrackCategoryId)
          .map((rating) => ({
            itemId: rating.trackId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = trackAverageById.get(rating.trackId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          })),
      );

      const effectiveTrackIds = recommendationBase.eligible
        ? applyRecommendationOverrides(
            recommendationBase.candidateIds,
            recommendationUser.recommendedTrackOverrideIds ?? [],
            recommendationUser.recommendedTrackHiddenIds ?? [],
          )
        : [];

      effectiveTrackIds.forEach((trackId) => {
        const current = favoriteTrackCountMap.get(trackId);
        if (!current) return;
        current.count += 1;
        if (current.users.length < 5) {
          current.users.push(toFavoriteCountUser(recommendationUser));
        }
      });
    }
  });

  return {
    favoriteGameCounts: [...favoriteGameCountMap.entries()].map(
      ([gameId, value]) => ({
        gameId,
        count: value.count,
        users: value.users,
      }),
    ),
    favoriteTrackCounts: [...favoriteTrackCountMap.entries()].map(
      ([trackId, value]) => ({
        trackId,
        count: value.count,
        users: value.users,
      }),
    ),
  };
}
