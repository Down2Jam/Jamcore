import { PageVersion } from "@prisma/client";

import type {
  TargetUserBaseRecord,
  TargetUserDetailRecord,
} from "../../types/user.js";
import { rankRecommendationCandidates } from "./recommendations.core.js";

export type GameAverageMap = Map<number, { total: number; count: number }>;
export type TrackAverageMap = Map<number, { total: number; count: number }>;

export type GameRatingLike = {
  gameId: number;
  categoryId: number;
  value: number;
  updatedAt: Date;
  gamePage?: { version?: PageVersion | null } | null;
  game?: { jamId: number } | null;
};

export type TrackRatingLike = {
  trackId: number;
  categoryId: number;
  value: number;
  updatedAt: Date;
  track?: { gamePage?: { game?: { jamId: number } | null } | null } | null;
};

export type RecommendationBase = {
  ratings: Array<GameRatingLike & { pageVersion: PageVersion }>;
  gameAverageById: GameAverageMap;
  trackAverageById: TrackAverageMap;
};

export function getRatingPageVersion(
  rating: Pick<GameRatingLike, "gamePage">,
): PageVersion {
  return rating.gamePage?.version === PageVersion.POST_JAM
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

export function buildUserRecommendationBase(
  user: Pick<TargetUserBaseRecord | TargetUserDetailRecord, "ratings" | "trackRatings">,
  activeJamId: number | null,
): RecommendationBase {
  const ratings = (user.ratings ?? []).map((rating) => ({
    ...rating,
    pageVersion: getRatingPageVersion(rating),
  }));

  const gameAverageById = ratings.reduce<GameAverageMap>((acc, rating) => {
    if (activeJamId != null && rating.game?.jamId !== activeJamId) return acc;
    if (rating.pageVersion !== PageVersion.JAM) return acc;
    const current = acc.get(rating.gameId) ?? { total: 0, count: 0 };
    current.total += rating.value;
    current.count += 1;
    acc.set(rating.gameId, current);
    return acc;
  }, new Map());

  const trackAverageById = (user.trackRatings ?? []).reduce<TrackAverageMap>(
    (acc, rating) => {
      if (
        activeJamId != null &&
        rating.track?.gamePage?.game?.jamId !== activeJamId
      ) {
        return acc;
      }
      const current = acc.get(rating.trackId) ?? { total: 0, count: 0 };
      current.total += rating.value;
      current.count += 1;
      acc.set(rating.trackId, current);
      return acc;
    },
    new Map(),
  );

  return {
    ratings,
    gameAverageById,
    trackAverageById,
  };
}

export function buildGameRecommendationBase(
  ratings: RecommendationBase["ratings"],
  overallGameCategoryId: number | null,
  activeJamId: number | null,
  gameAverageById: GameAverageMap,
) {
  return rankRecommendationCandidates(
    overallGameCategoryId
      ? ratings
          .filter(
            (rating) =>
              activeJamId == null || rating.game?.jamId === activeJamId,
          )
          .filter((rating) => rating.pageVersion === PageVersion.JAM)
          .filter((rating) => rating.categoryId === overallGameCategoryId)
          .map((rating) => ({
            itemId: rating.gameId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = gameAverageById.get(rating.gameId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          }))
      : [],
  );
}

export function buildTrackRecommendationBase(
  trackRatings: TrackRatingLike[],
  overallTrackCategoryId: number | null,
  activeJamId: number | null,
  trackAverageById: TrackAverageMap,
) {
  return rankRecommendationCandidates(
    overallTrackCategoryId
      ? trackRatings
          .filter(
            (rating) =>
              activeJamId == null ||
              rating.track?.gamePage?.game?.jamId === activeJamId,
          )
          .filter((rating) => rating.categoryId === overallTrackCategoryId)
          .map((rating) => ({
            itemId: rating.trackId,
            value: rating.value,
            tieBreakerValue: (() => {
              const aggregate = trackAverageById.get(rating.trackId);
              return aggregate ? aggregate.total / aggregate.count : undefined;
            })(),
            updatedAt: rating.updatedAt,
          }))
      : [],
  );
}
