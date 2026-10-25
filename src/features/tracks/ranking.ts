import { buildJamTimeline } from "../../domain/jamTimeline.js";
import { areRatingValuesPublic } from "../ratings/visibility.js";
import { latestTrackRatings, rankedTrackRatings, postJamTrackScore } from "../ratings/track-values.js";
import { isActiveGameRating } from "../ratings/active.js";
import { PageVersion } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import {
  applyRecommendationOverrides,
  rankRecommendationCandidates,
} from "../users/recommendations.core.js";
import { isNonCompetitiveGameCategory } from "../games/policies.js";
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
      !isNonCompetitiveGameCategory(candidateGame.category)
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
          (rating.rankedValue != null && rating.track?.gamePage?.game?.jamId === track.game.jamId
            ? 1 / categoryCount
            : 0),
        0,
      ),
    0,
  );
}

export function getTrackRatingsGottenCount(track: any, categoryCount: number) {
  return (
    rankedTrackRatings<any>(track.ratings).filter((rating: any) =>
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
    rankedTrackRatings<any>(candidate.ratings).forEach((rating: any) => {
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
    rankedTrackRatings<any>(candidate.ratings).forEach((rating: any) => {
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

export function getTrackScoreSortValues(track: any) {
  if (!areRatingValuesPublic(track.game?.jam ?? track.gamePage?.game?.jam, track.pageVersion ?? PageVersion.JAM)) {
    return { adjusted: SCORE_SORT_MIDPOINT, average: SCORE_SORT_MIDPOINT, count: SCORE_SORT_RATING_GOAL };
  }
  if (track.pageVersion === PageVersion.POST_JAM) {
    const ratings = track.scoreRatings ?? track.ratings.map((rating: any) => ({ ...rating, trackPageVersion: PageVersion.POST_JAM }));
    const score = postJamTrackScore<any>(ratings.filter((rating: any) =>
      rating.category?.name === appConfig.games.ratingCategoryNames.overallTrack &&
      isAllowedRaterInJam(rating, track.game.jamId),
    ));
    const missingRatings = Math.max(0, SCORE_SORT_RATING_GOAL - score.ratingCount);
    const adjusted = (score.averageScore * score.ratingCount + missingRatings * SCORE_SORT_MIDPOINT) /
      Math.max(score.ratingCount, SCORE_SORT_RATING_GOAL);
    return { adjusted, average: score.ratingCount ? score.averageScore : SCORE_SORT_MIDPOINT, count: score.ratingCount };
  }
  const getOverallRatings = (track: any) =>
    rankedTrackRatings<any>(track.ratings).filter((rating: any) => {
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
          isActiveGameRating(rating) &&
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

  return { adjusted: getScoreSortAdjusted(track), average: getScoreSortAverage(track), count: getScoreSortCount(track) };
}

export function sortTracksByScore(tracks: any[]) {
  const values = new Map(tracks.map(track => [track, getTrackScoreSortValues(track)]));
  return [...tracks].sort((a, b) => {
    const first = values.get(a)!;
    const second = values.get(b)!;
    return second.adjusted - first.adjusted || second.average - first.average || second.count - first.count || b.id - a.id;
  });
}

export function trackRecommendationUsesScore(track: any, now = new Date()) {
  const jam = track.game?.jam ?? track.gamePage?.game?.jam;
  if (!jam) return true;
  const timeline = buildJamTimeline(jam);
  const end = track.pageVersion === PageVersion.POST_JAM ? timeline.postJamRatingEnd : timeline.ratingEnd;
  return now >= end;
}

export function sortTracksByLeastRatings(tracks: any[], categoryCount: number) {
  return [...tracks].sort(
    (a, b) => a.ratings.length / categoryCount - b.ratings.length / categoryCount,
  );
}

export function sortDangerTracks(tracks: any[], categoryCount: number) {
  return tracks
    .filter((track) => !isNonCompetitiveGameCategory(track.game.category))
    .filter((track) => {
      const allowedCount = rankedTrackRatings<any>(track.ratings).filter((rating: any) =>
        isAllowedRaterInJam(rating, track.game.jamId),
      ).length;
      return allowedCount < 5;
    })
    .sort((a, b) => {
      const allowedA = rankedTrackRatings<any>(a.ratings).filter((rating: any) =>
        isAllowedRaterInJam(rating, a.game.jamId),
      ).length;
      const allowedB = rankedTrackRatings<any>(b.ratings).filter((rating: any) =>
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
  allJams = false,
}: {
  tracks: any[];
  categoryCount: number;
  sort: "karma" | "recommended";
  trackCategories: Array<{ id: number; name: string }>;
  allJams?: boolean;
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
    tracks.filter((track) => areRatingValuesPublic(track.game?.jam ?? track.gamePage?.game?.jam, track.pageVersion ?? PageVersion.JAM)),
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

  const now = new Date();
  const scores = new Map(tracks.map(track => {
    const base = sort === "recommended" && (allJams || trackRecommendationUsesScore(track, now))
      ? getTrackScoreSortValues(track).adjusted
      : karmaScore(track);
    return [track, base + (sort === "recommended" ? recommendedBoost(track) : 0)];
  }));
  return [...tracks].sort((a, b) => scores.get(b)! - scores.get(a)! || b.id - a.id);
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
      const isPostJam = candidate.gamePage.version === PageVersion.POST_JAM;
      const postJamScore = isPostJam ? postJamTrackScore<any>(candidate.ratings.filter((rating: any) =>
        rating.categoryId === category.id && isAllowedRaterInJam(rating, jamId),
      )) : null;
      const categoryRatings = latestTrackRatings<any>(candidate.ratings.filter((rating: any) =>
        !isPostJam || rating.trackPageVersion === PageVersion.POST_JAM,
      )).filter(
        (rating: any) => rating.categoryId === category.id,
      );
      const rankedRatings = rankedTrackRatings<any>(candidate.ratings).filter((rating: any) => rating.categoryId === category.id).filter((rating: any) =>
        rating.user.teams.some((team: any) => {
          const candidateGame = team.game;
          return (
            candidateGame &&
            candidateGame.published &&
            candidateGame.jamId === jamId &&
            !isNonCompetitiveGameCategory(candidateGame.category)
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
        averageScore: postJamScore?.averageScore ?? averageScore,
        averageUnrankedScore,
        ratingCount: categoryRatings.length,
        rankedRatingCount: postJamScore?.ratingCount ?? rankedRatings.length,
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
              (rating.rankedValue != null && rating.track?.gamePage?.game?.jamId === jamId &&
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
      scorePageVersion === PageVersion.JAM &&
      candidate.origin !== "ASSET_PACK" &&
      !isNonCompetitiveGameCategory(candidate.gamePage.game.category) &&
      overallCategory &&
      overallCategory.rankedRatingCount >= 5 &&
      Math.round(candidate.ratingsCount) >= 5
    );
  });

  for (const category of trackCategories) {
    const sorted = rankedTracks.map((candidate) => ({
      candidate,
      score: candidate.categoryAverages.find((entry: any) => entry.categoryId === category.id),
    })).sort((a, b) => (b.score?.averageScore ?? 0) - (a.score?.averageScore ?? 0));
    sorted.forEach(({ score }, index) => {
      if (score) score.placement = index + 1;
    });
  }

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
        scorePageVersion === PageVersion.JAM &&
        target.origin !== "ASSET_PACK" &&
        !isNonCompetitiveGameCategory(target.gamePage.game.category) &&
        category.rankedRatingCount >= 5 &&
        Math.round(target.ratingsCount) >= 5;

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
        ratings: (track.ratings ?? []).map((rating: any) => ({ ...rating, trackPageVersion: track.gamePage?.version })),
        hasPostJam: isPostJam,
      });
      return;
    }

    existing.ratings.push(...(track.ratings ?? []).map((rating: any) => ({ ...rating, trackPageVersion: track.gamePage?.version })));
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
