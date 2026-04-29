import { PageVersion } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "../users/recommendations.core.js";
import { EXTRA_GAME_CATEGORY } from "../games/policies.js";
import { loadTrackRecommendationUsers } from "./queries.js";

const SCORE_SORT_RATING_GOAL = 5;
const SCORE_SORT_MIDPOINT = 6;
const GAME_AUDIO_CATEGORY_NAME = "RatingCategory.Audio.Title";

export function isAllowedRaterInJam(rating: any, jamId: number) {
  return rating.user.teams.some((team: any) => {
    const candidateGame = team.game;
    return (
      candidateGame &&
      candidateGame.published &&
      candidateGame.jamId === jamId &&
      candidateGame.category !== EXTRA_GAME_CATEGORY
    );
  });
}

export function getTrackRatingsGivenCount(track: any, categoryCount: number) {
  return track.game.team.users.reduce(
    (sum: number, user: any) =>
      sum +
      user.trackRatings.reduce(
        (inner: number, rating: any) =>
          inner +
          (rating.track?.gamePage?.game?.jamId === track.game.jamId
            ? 1 / categoryCount
            : 0),
        0,
      ),
    0,
  );
}

export function getTrackRatingsGottenCount(track: any, categoryCount: number) {
  return (
    track.ratings.filter((rating: any) =>
      isAllowedRaterInJam(rating, track.game.jamId),
    ).length / categoryCount
  );
}

export function getRecommendationKey(track: any) {
  return `${track.sourceTrackId ?? track.id}:${track.pageVersion ?? PageVersion.JAM}`;
}

function getRecommendationKeyForTrackId(trackId: number) {
  return `${trackId}:${PageVersion.JAM}`;
}

export function getTrackCommentsLikeCount(track: any) {
  return track.game.team.users.reduce(
    (sum: number, user: any) =>
      sum +
      user.comments
        .filter(
          (comment: any) =>
            comment.trackId &&
            comment.trackId !== track.id &&
            comment.track?.gamePage?.game?.jamId === track.game.jamId,
        )
        .reduce(
          (inner: number, comment: any) =>
            inner +
            comment.likes.filter(
              (like: any) =>
                !track.game.team.users.some(
                  (teamUser: any) => teamUser.id === like.userId,
                ),
            ).length,
          0,
        ),
    0,
  );
}

async function buildRecommendedPointsByTrackId(
  tracks: any[],
  overallCategoryId: number | null,
) {
  const recommendationSlots = 3;
  const recommendedPointsByTrackId = new Map<string, number>();

  if (!overallCategoryId) {
    return recommendedPointsByTrackId;
  }

  const ratingsByUser = new Map<
    number,
    Array<{
      trackId: string;
      value: number;
      tieBreakerValue: number;
      updatedAt: number;
    }>
  >();
  const ratingAveragesByUserTrack = new Map<
    number,
    Map<number, { total: number; count: number }>
  >();

  tracks.forEach((candidate) => {
    candidate.ratings.forEach((rating: any) => {
      if (!isAllowedRaterInJam(rating, candidate.game.jamId)) return;

      const averagesForUser = ratingAveragesByUserTrack.get(rating.userId) ?? new Map();
      const aggregate = averagesForUser.get(candidate.id) ?? {
        total: 0,
        count: 0,
      };
      aggregate.total += rating.value;
      aggregate.count += 1;
      averagesForUser.set(candidate.id, aggregate);
      ratingAveragesByUserTrack.set(rating.userId, averagesForUser);
    });
  });

  tracks.forEach((candidate) => {
    candidate.ratings.forEach((rating: any) => {
      if (!isAllowedRaterInJam(rating, candidate.game.jamId)) return;
      if (rating.categoryId !== overallCategoryId) return;

      const existing = ratingsByUser.get(rating.userId) ?? [];
      const averagesForUser = ratingAveragesByUserTrack.get(rating.userId);
      const average = averagesForUser?.get(candidate.id);
      existing.push({
        trackId: getRecommendationKey(candidate),
        value: rating.value,
        tieBreakerValue: average ? average.total / average.count : rating.value,
        updatedAt: rating.updatedAt.getTime(),
      });
      ratingsByUser.set(rating.userId, existing);
    });
  });

  const recommendationUsers = await loadTrackRecommendationUsers([
    ...ratingsByUser.keys(),
  ]);
  const recommendationUserMap = new Map(
    recommendationUsers.map((user) => [user.id, user]),
  );

  ratingsByUser.forEach((entries, userId) => {
    const ranking = rankRecommendationCandidates(
      entries.map((entry) => ({
        itemId: entry.trackId,
        value: entry.value,
        tieBreakerValue: entry.tieBreakerValue,
        updatedAt: entry.updatedAt,
      })),
    );
    if (!ranking.eligible) return;

    const recommendationUser = recommendationUserMap.get(userId);
    applyRecommendationOverrides(
      ranking.candidateIds,
      (recommendationUser?.recommendedTrackOverrideIds ?? []).map((trackId) =>
        getRecommendationKeyForTrackId(trackId),
      ),
      (recommendationUser?.recommendedTrackHiddenIds ?? []).map((trackId) =>
        getRecommendationKeyForTrackId(trackId),
      ),
      recommendationSlots,
    ).forEach((trackId) => {
      const current = recommendedPointsByTrackId.get(trackId) ?? 0;
      recommendedPointsByTrackId.set(trackId, current + 1);
    });
  });

  return recommendedPointsByTrackId;
}

export function sortTracksByScore(tracks: any[]) {
  const getOverallRatings = (track: any) =>
    track.ratings.filter((rating: any) => {
      const numericValue = Number(rating.value);
      return (
        rating.category?.name === appConfig.games.ratingCategoryNames.overallTrack &&
        Number.isFinite(numericValue) &&
        isAllowedRaterInJam(rating, track.game.jamId)
      );
    });

  const getGameAudioRatings = (track: any) =>
    (track.game?.ratings ?? track.gamePage?.game?.ratings ?? []).filter(
      (rating: any) => {
        const numericValue = Number(rating.value);
        return (
          rating.gamePage?.version === (track.pageVersion ?? PageVersion.JAM) &&
          rating.category?.name === GAME_AUDIO_CATEGORY_NAME &&
          Number.isFinite(numericValue) &&
          isAllowedRaterInJam(rating, track.game.jamId)
        );
      },
    );

  const getScoreSortAverage = (track: any) => {
    const overallRatings = getOverallRatings(track);
    if (overallRatings.length === 0) return SCORE_SORT_MIDPOINT;

    return (
      overallRatings.reduce(
        (sum: number, rating: any) => sum + Number(rating.value),
        0,
      ) / overallRatings.length
    );
  };

  const getScoreSortAdjusted = (track: any) => {
    const overallRatings = getOverallRatings(track);
    if (overallRatings.length >= SCORE_SORT_RATING_GOAL) {
      return getScoreSortAverage(track);
    }

    const missingOverallRatings = SCORE_SORT_RATING_GOAL - overallRatings.length;
    const gameAudioRatings = getGameAudioRatings(track);
    const gameAudioAverage =
      gameAudioRatings.length > 0
        ? gameAudioRatings.reduce(
            (sum: number, rating: any) => sum + Number(rating.value),
            0,
          ) / gameAudioRatings.length
        : SCORE_SORT_MIDPOINT;
    const gameAudioFillCount = Math.min(
      gameAudioRatings.length,
      missingOverallRatings,
    );
    const midpointFillCount = missingOverallRatings - gameAudioFillCount;

    return (
      overallRatings.reduce(
        (sum: number, rating: any) => sum + Number(rating.value),
        0,
      ) +
      gameAudioFillCount * gameAudioAverage +
      midpointFillCount * SCORE_SORT_MIDPOINT
    ) / SCORE_SORT_RATING_GOAL;
  };

  const getScoreSortCount = (track: any) => getOverallRatings(track).length;

  return [...tracks].sort((a, b) => {
    return (
      getScoreSortAdjusted(b) - getScoreSortAdjusted(a) ||
      getScoreSortAverage(b) - getScoreSortAverage(a) ||
      getScoreSortCount(b) - getScoreSortCount(a) ||
      b.id - a.id
    );
  });
}

export function sortTracksByLeastRatings(tracks: any[], categoryCount: number) {
  return [...tracks].sort(
    (a, b) => a.ratings.length / categoryCount - b.ratings.length / categoryCount,
  );
}

export function sortDangerTracks(tracks: any[], categoryCount: number) {
  return tracks
    .filter((track) => track.game.category !== EXTRA_GAME_CATEGORY)
    .filter((track) => {
      const allowedCount = track.ratings.filter((rating: any) =>
        isAllowedRaterInJam(rating, track.game.jamId),
      ).length;
      return allowedCount < 5;
    })
    .sort((a, b) => {
      const allowedA = a.ratings.filter((rating: any) =>
        isAllowedRaterInJam(rating, a.game.jamId),
      ).length;
      const allowedB = b.ratings.filter((rating: any) =>
        isAllowedRaterInJam(rating, b.game.jamId),
      ).length;

      return allowedB / categoryCount - allowedA / categoryCount;
    });
}

export function sortTracksByRatingBalance(tracks: any[], categoryCount: number) {
  const ratingsGiven = (track: any) => getTrackRatingsGivenCount(track, categoryCount);
  const ratingsGotten = (track: any) =>
    getTrackRatingsGottenCount(track, categoryCount);

  return [...tracks].sort(
    (a, b) =>
      ratingsGiven(b) - ratingsGotten(b) - (ratingsGiven(a) - ratingsGotten(a)),
  );
}

export async function sortTracksByKarmaOrRecommendation({
  tracks,
  categoryCount,
  sort,
  trackCategories,
}: {
  tracks: any[];
  categoryCount: number;
  sort: "karma" | "recommended";
  trackCategories: Array<{ id: number; name: string }>;
}) {
  const exponent = 0.73412;
  const recommendationWeight = 2;
  const ratingsGiven = (track: any) => getTrackRatingsGivenCount(track, categoryCount);
  const ratingsGotten = (track: any) =>
    getTrackRatingsGottenCount(track, categoryCount);
  const overallCategoryId =
    trackCategories.find(
      (category) =>
        category.name === appConfig.games.ratingCategoryNames.overallTrack,
    )?.id ?? null;
  const recommendedPointsByTrackId = await buildRecommendedPointsByTrackId(
    tracks,
    overallCategoryId,
  );

  const karmaScore = (track: any) => {
    const given = ratingsGiven(track);
    const gotten = ratingsGotten(track);
    const likes = getTrackCommentsLikeCount(track);

    return given ** exponent + likes ** exponent - gotten;
  };

  const recommendedBoost = (track: any) => {
    const points = recommendedPointsByTrackId.get(getRecommendationKey(track)) ?? 0;
    if (points <= 0) return 0;
    return recommendationWeight * points ** exponent;
  };

  return [...tracks].sort((a, b) => {
    const aScore =
      karmaScore(a) + (sort === "recommended" ? recommendedBoost(a) : 0);
    const bScore =
      karmaScore(b) + (sort === "recommended" ? recommendedBoost(b) : 0);

    return bScore - aScore;
  });
}

export function buildTrackDetailScores({
  scoreTracks,
  trackCategories,
  jamId,
  targetTrackId,
  scorePageVersion,
}: {
  scoreTracks: any[];
  trackCategories: Array<{ id: number; name: string }>;
  jamId: number;
  targetTrackId: number;
  scorePageVersion: PageVersion;
}) {
  const scoreVersions =
    scorePageVersion === PageVersion.POST_JAM
      ? [PageVersion.JAM, PageVersion.POST_JAM]
      : [scorePageVersion];
  const scoreCandidates =
    scorePageVersion === PageVersion.POST_JAM
      ? buildPostJamScoreCandidates(scoreTracks)
      : scoreTracks;

  const trackWithScores = scoreCandidates.map((candidate) => {
    const categoryAverages = trackCategories.map((category) => {
      const categoryRatings = candidate.ratings.filter(
        (rating: any) => rating.categoryId === category.id,
      );
      const rankedRatings = categoryRatings.filter((rating: any) =>
        rating.user.teams.some((team: any) => {
          const candidateGame = team.game;
          return (
            candidateGame &&
            candidateGame.published &&
            candidateGame.jamId === jamId &&
            candidateGame.category !== EXTRA_GAME_CATEGORY
          );
        }),
      );

      const averageUnrankedScore =
        categoryRatings.length > 0
          ? categoryRatings.reduce((sum: number, rating: any) => sum + rating.value, 0) /
            categoryRatings.length
          : 0;

      const averageScore =
        rankedRatings.length > 0
          ? rankedRatings.reduce((sum: number, rating: any) => sum + rating.value, 0) /
            rankedRatings.length
          : 0;

      return {
        categoryId: category.id,
        categoryName: category.name,
        averageScore,
        averageUnrankedScore,
        ratingCount: categoryRatings.length,
        rankedRatingCount: rankedRatings.length,
        placement: -1,
      };
    });

    return {
      ...candidate,
      categoryAverages,
      ratingsCount: candidate.gamePage.game.team.users.reduce(
        (totalRatings: number, user: any) => {
          const userRatingCount = user.trackRatings.reduce(
            (count: number, rating: any) =>
              count +
              (rating.track?.gamePage?.game?.jamId === jamId &&
              scoreVersions.includes(
                rating.track?.gamePage?.version ?? PageVersion.JAM,
              )
                ? 1 / trackCategories.length
                : 0),
            0,
          );
          return totalRatings + userRatingCount;
        },
        0,
      ),
    };
  });

  const rankedTracks = trackWithScores.filter((candidate) => {
    const overallCategory = candidate.categoryAverages.find(
      (avg: any) =>
        avg.categoryName === appConfig.games.ratingCategoryNames.overallTrack,
    );
    return (
      candidate.gamePage.game.category !== EXTRA_GAME_CATEGORY &&
      overallCategory &&
      overallCategory.rankedRatingCount >= 5 &&
      candidate.ratingsCount >= 4.99
    );
  });

  rankedTracks.forEach((candidate) => {
    candidate.categoryAverages.forEach((category: any) => {
      const rankedInCategory = rankedTracks
        .map((other) => ({
          trackId: other.id,
          score:
            other.categoryAverages.find(
              (cat: any) => cat.categoryId === category.categoryId,
            )?.averageScore ?? 0,
        }))
        .sort((a, b) => b.score - a.score);

      const placement = rankedInCategory.findIndex(
        (other) => other.trackId === candidate.id,
      );
      category.placement = placement + 1;
    });
  });

  const target = trackWithScores.find((candidate) => candidate.id === targetTrackId);
  const scores: Record<
    string,
    {
      placement: number;
      averageScore: number;
      averageUnrankedScore: number;
      ratingCount: number;
      rankedRatingCount: number;
      ratingsGivenCount: number;
    }
  > = {};

  if (target) {
    target.categoryAverages.forEach((category: any) => {
      const canBeRanked =
        target.gamePage.game.category !== EXTRA_GAME_CATEGORY &&
        category.rankedRatingCount >= 5 &&
        target.ratingsCount >= 4.99;

      scores[category.categoryName] = {
        placement: canBeRanked ? category.placement : -1,
        averageScore: category.averageScore,
        averageUnrankedScore: category.averageUnrankedScore,
        ratingCount: category.ratingCount,
        rankedRatingCount: category.rankedRatingCount,
        ratingsGivenCount: target.ratingsCount,
      };
    });
  }

  return scores;
}

function buildPostJamScoreCandidates(scoreTracks: any[]) {
  const groupedTracks = new Map<
    string,
    { representative: any; ratings: any[]; hasPostJam: boolean }
  >();

  scoreTracks.forEach((track) => {
    const key = `${track.gamePage?.game?.id ?? track.gamePage?.gameId ?? "unknown"}:${
      track.slug
    }`;
    const existing = groupedTracks.get(key);
    const isPostJam = track.gamePage?.version === PageVersion.POST_JAM;

    if (!existing) {
      groupedTracks.set(key, {
        representative: track,
        ratings: [...(track.ratings ?? [])],
        hasPostJam: isPostJam,
      });
      return;
    }

    existing.ratings.push(...(track.ratings ?? []));
    existing.hasPostJam ||= isPostJam;
    if (isPostJam) {
      existing.representative = track;
    }
  });

  return [...groupedTracks.values()]
    .filter((group) => group.hasPostJam)
    .map((group) => ({
      ...group.representative,
      ratings: group.ratings,
    }));
}
