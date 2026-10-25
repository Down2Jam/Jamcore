import { latestTrackRatings, rankedTrackRatings } from "../ratings/track-values.js";
import { activeRatingSelect, activeRatingPageSelect, isActiveGameRating } from "../ratings/active.js";
import { GameCategory, PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { areRatingValuesPublic } from "../ratings/visibility.js";
import { appConfig } from "../../config/app.js";
import { materializeTrackPage } from "../tracks/page.js";
import {
  ODA_GAME_CATEGORY,
  REGULAR_GAME_CATEGORY,
  isNonCompetitiveGameCategory,
} from "../games/policies.js";

const RESULT_RATING_TARGET = 5;
const RESULT_SCORE_MIDPOINT = 6;
const GAME_AUDIO_CATEGORY_NAME = "RatingCategory.Audio.Title";

export async function loadMusicResults({
  jamId,
  category,
  adminPreview = false,
}: {
  jamId: number;
  category?: string;
  adminPreview?: boolean;
}) {
  const trackCategory =
    category === REGULAR_GAME_CATEGORY || category === ODA_GAME_CATEGORY
      ? (category as GameCategory)
      : undefined;
  const tracks = await db.gamePageTrack.findMany({
    where: {
      origin: "ORIGINAL",
      gamePage: {
        version: {
          in: [PageVersion.JAM],
        },
        game: {
          jamId,
          published: true,
          ...(trackCategory ? { category: trackCategory } : {}),
        },
      },
    },
    include: {
      composer: true,
      gamePage: {
        include: {
          game: {
            include: {
              jam: true,
              team: {
                select: {
                  users: {
                    select: {
                      trackRatings: {
                        select: {
                          rankedValue: true,
                          track: {
                            select: {
                              gamePage: {
                                select: {
                                  version: true,
                                  game: {
                                    select: {
                                      jamId: true,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              ratings: {
                select: {
                  ...activeRatingSelect,
                  rankedValue: true,
                  value: true,
                  category: {
                    select: {
                      always: true,
                      name: true,
                    },
                  },
                  gamePage: {
                    select: {
                      ...activeRatingPageSelect,
                      version: true,
                    },
                  },
                  user: {
                    select: {
                      teams: {
                        select: {
                          game: {
                            select: {
                              jamId: true,
                              category: true,
                              published: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ratings: {
        select: {
          id: true,
          userId: true,
          updatedAt: true,
          rankedValue: true,
          rankedUpdatedAt: true,
          value: true,
          categoryId: true,
          user: {
            select: {
              teams: {
                select: {
                  game: {
                    select: {
                      jamId: true,
                      category: true,
                      published: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const trackCategories = await db.trackRatingCategory.findMany({
    where: {
      always: true,
    },
  });

  const now = new Date();
  const computedTracks = tracks
    .filter((track) => track.gamePage.version === PageVersion.JAM && (adminPreview || areRatingValuesPublic(track.gamePage.game.jam, PageVersion.JAM, now)))
    .map((track) => ({
      ...track,
      gamePage: {
        ...track.gamePage,
        game: {
          ...track.gamePage.game,
          ratings: track.gamePage.game.ratings.filter((rating) => (rating.gamePage?.version ?? PageVersion.JAM) === PageVersion.JAM),
        },
      },
    }));

  const rankedTracksWithScores = computedTracks
    .map((track) => {
      const materializedTrack = materializeTrackPage(track);
      const materializedGame = materializedTrack.game as typeof track.gamePage.game | null;
      if (!materializedGame) {
        return null;
      }
      const gameMusicRatings =
        (track.gamePage.game.ratings as any[] | undefined)?.filter(
          (rating: any) =>
            rating.rankedValue != null && isActiveGameRating(rating) && (rating.gamePage?.version ?? PageVersion.JAM) === PageVersion.JAM &&
            rating.category?.name === GAME_AUDIO_CATEGORY_NAME &&
            rating.user.teams.some((team: any) => {
              const candidateGame = team.game;
              return (
                candidateGame &&
                candidateGame.published &&
                candidateGame.jamId === jamId &&
                !isNonCompetitiveGameCategory(candidateGame.category)
              );
            }),
        ) ?? [];
      const gameMusicAverage =
        gameMusicRatings.length > 0
          ? gameMusicRatings.reduce(
              (sum: number, rating: any) => sum + rating.rankedValue,
              0,
            ) /
            gameMusicRatings.length
          : RESULT_SCORE_MIDPOINT;

      const categoryAverages = trackCategories.map((ratingCategory) => {
        const categoryRatings = latestTrackRatings<any>(track.ratings).filter(
          (rating: any) => rating.categoryId === ratingCategory.id,
        );
        const rankedRatings = rankedTrackRatings<any>(track.ratings).filter((rating: any) => rating.categoryId === ratingCategory.id).filter((rating: any) =>
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
            ? categoryRatings.reduce(
                (sum: number, rating: any) => sum + rating.value,
                0,
              ) /
              categoryRatings.length
            : 0;

        const averageScore =
          rankedRatings.length > 0
            ? rankedRatings.reduce(
                (sum: number, rating: any) => sum + rating.value,
                0,
              ) /
              rankedRatings.length
            : 0;
        const missingRankedRatings = Math.max(
          0,
          RESULT_RATING_TARGET - rankedRatings.length,
        );
        const gameMusicFillCount = Math.min(
          gameMusicRatings.length,
          missingRankedRatings,
        );
        const midpointFillCount = missingRankedRatings - gameMusicFillCount;
        const effectiveAverageScore =
          ratingCategory.name ===
            appConfig.games.ratingCategoryNames.overallTrack &&
          rankedRatings.length < RESULT_RATING_TARGET
            ? (rankedRatings.reduce(
                (sum: number, rating: any) => sum + rating.value,
                0,
              ) +
                gameMusicFillCount * gameMusicAverage +
                midpointFillCount * RESULT_SCORE_MIDPOINT) /
              RESULT_RATING_TARGET
            : averageScore;

        return {
          categoryId: ratingCategory.id,
          categoryName: ratingCategory.name,
          averageScore: effectiveAverageScore,
          averageUnrankedScore,
          ratingCount: categoryRatings.length,
          rankedRatingCount:
            ratingCategory.name ===
              appConfig.games.ratingCategoryNames.overallTrack &&
            rankedRatings.length < RESULT_RATING_TARGET
              ? RESULT_RATING_TARGET
              : rankedRatings.length,
          actualRankedRatingCount: rankedRatings.length,
          placement: -1,
        };
      });

      return {
        ...materializedTrack,
        game: materializedGame,
        categoryAverages,
        ratingsCount: track.gamePage.game.team.users.reduce((totalRatings: number, user: any) => {
          const userRatingCount = user.trackRatings.reduce(
            (count: number, rating: any) =>
              count +
              (rating.rankedValue != null && rating.track?.gamePage?.game?.jamId === jamId &&
              (rating.track?.gamePage?.version ?? PageVersion.JAM) === PageVersion.JAM
                ? 1 / trackCategories.length
                : 0),
            0,
          );
          return totalRatings + userRatingCount;
        }, 0),
      };
    })
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
    .filter((track) => !isNonCompetitiveGameCategory(track.game.category));

  const qualifiedTracks = rankedTracksWithScores
    .filter((track) => {
      const overall = track.categoryAverages.find(
        (avg: any) =>
          avg.categoryName === appConfig.games.ratingCategoryNames.overallTrack,
      );
      return (
        !isNonCompetitiveGameCategory(track.game.category) &&
        overall &&
        (track.game.jam?.musicRankingRuleVersion >= 2
          ? overall.actualRankedRatingCount >= RESULT_RATING_TARGET
          : overall.rankedRatingCount >= RESULT_RATING_TARGET)
      );
    })
    .filter((track) => Math.round(track.ratingsCount) >= 5);

  const placementsByCategory = new Map<number, Map<number, number>>();
  qualifiedTracks.forEach((track) => {
    track.categoryAverages.forEach((ratingCategory: any) => {
      let placements = placementsByCategory.get(ratingCategory.categoryId);

      if (!placements) {
        const rankedTracks = qualifiedTracks
          .map((candidate) => ({
            trackId: candidate.id,
            score:
              candidate.categoryAverages.find(
                (avg: any) => avg.categoryId === ratingCategory.categoryId,
              )?.averageScore ?? 0,
          }))
          .sort((a, b) => b.score - a.score);
        placements = new Map(rankedTracks.map((rankedTrack, index) => [rankedTrack.trackId, index + 1]));
        placementsByCategory.set(ratingCategory.categoryId, placements);
      }

      ratingCategory.placement = placements.get(track.id) ?? -1;
    });
  });

  qualifiedTracks.sort((a, b) => {
    const aOverall =
      a.categoryAverages.find(
        (avg: any) =>
          avg.categoryName === appConfig.games.ratingCategoryNames.overallTrack,
      )?.averageScore ?? 0;
    const bOverall =
      b.categoryAverages.find(
        (avg: any) =>
          avg.categoryName === appConfig.games.ratingCategoryNames.overallTrack,
      )?.averageScore ?? 0;
    return bOverall - aOverall;
  });

  return qualifiedTracks.map((track) => {
    const game = {
      ...track.game,
      team: {
        ...track.game.team,
        users: track.game.team.users.map(({ trackRatings: _ratings, ...user }: any) => user),
      },
    };
    return { ...track, game, gamePage: { ...track.gamePage, game } };
  });
}
