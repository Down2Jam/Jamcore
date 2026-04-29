import { GameCategory, PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import { materializeTrackPage } from "../tracks/page.js";
import {
  EXTRA_GAME_CATEGORY,
  ODA_GAME_CATEGORY,
  REGULAR_GAME_CATEGORY,
} from "../games/policies.js";

const RESULT_RATING_TARGET = 5;
const RESULT_SCORE_MIDPOINT = 6;
const GAME_AUDIO_CATEGORY_NAME = "RatingCategory.Audio.Title";

function getTrackGroupKey(track: any) {
  return `${track.gamePage?.game?.id ?? track.gamePage?.gameId ?? "unknown"}:${
    track.slug
  }`;
}

function getScoreVersions(version: PageVersion) {
  return version === PageVersion.POST_JAM
    ? [PageVersion.JAM, PageVersion.POST_JAM]
    : [version];
}

function buildResultTracks(tracks: any[]) {
  const groups = new Map<
    string,
    { representative: any; ratings: any[]; hasPostJam: boolean }
  >();

  tracks.forEach((track) => {
    const key = getTrackGroupKey(track);
    const existing = groups.get(key);
    const isPostJam = track.gamePage?.version === PageVersion.POST_JAM;
    if (!existing) {
      groups.set(key, {
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

  return [...groups.values()].map((group) => ({
    ...group.representative,
    ratings:
      group.representative.gamePage?.version === PageVersion.POST_JAM
        ? group.ratings
        : group.representative.ratings,
  }));
}

export async function loadMusicResults({
  jamId,
  category,
}: {
  jamId: number;
  category?: string;
}) {
  const trackCategory =
    category === REGULAR_GAME_CATEGORY || category === ODA_GAME_CATEGORY
      ? (category as GameCategory)
      : undefined;
  const tracks = await db.gamePageTrack.findMany({
    where: {
      gamePage: {
        version: {
          in: [PageVersion.JAM, PageVersion.POST_JAM],
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
              team: {
                select: {
                  users: {
                    select: {
                      trackRatings: {
                        select: {
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
                  value: true,
                  category: {
                    select: {
                      name: true,
                    },
                  },
                  gamePage: {
                    select: {
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

  const computedTracks = tracks
    .map((track) => track)
    .filter(Boolean);

  const resultTracks = buildResultTracks(computedTracks);

  const rankedTracksWithScores = resultTracks
    .map((track) => {
      const materializedTrack = materializeTrackPage(track);
      const materializedGame = materializedTrack.game;
      if (!materializedGame) {
        return null;
      }
      const scoreVersions = getScoreVersions(track.gamePage.version);
      const gameMusicRatings =
        (track.gamePage.game.ratings as any[] | undefined)?.filter(
          (rating: any) =>
            scoreVersions.includes(rating.gamePage?.version ?? PageVersion.JAM) &&
            rating.category?.name === GAME_AUDIO_CATEGORY_NAME &&
            rating.user.teams.some((team: any) => {
              const candidateGame = team.game;
              return (
                candidateGame &&
                candidateGame.published &&
                candidateGame.jamId === jamId &&
                candidateGame.category !== EXTRA_GAME_CATEGORY
              );
            }),
        ) ?? [];
      const gameMusicAverage =
        gameMusicRatings.length > 0
          ? gameMusicRatings.reduce(
              (sum: number, rating: any) => sum + rating.value,
              0,
            ) /
            gameMusicRatings.length
          : RESULT_SCORE_MIDPOINT;

      const categoryAverages = trackCategories.map((ratingCategory) => {
        const categoryRatings = (track.ratings as any[]).filter(
          (rating: any) => rating.categoryId === ratingCategory.id,
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
              (rating.track?.gamePage?.game?.jamId === jamId &&
              scoreVersions.includes(
                  rating.track?.gamePage?.version ?? PageVersion.JAM,
                )
                ? 1 / trackCategories.length
                : 0),
            0,
          );
          return totalRatings + userRatingCount;
        }, 0),
      };
    })
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
    .filter((track) => track.game.category !== EXTRA_GAME_CATEGORY);

  const qualifiedTracks = rankedTracksWithScores
    .filter((track) => {
      const overall = track.categoryAverages.find(
        (avg: any) =>
          avg.categoryName === appConfig.games.ratingCategoryNames.overallTrack,
      );
      return (
        track.game.category !== EXTRA_GAME_CATEGORY &&
        overall &&
        overall.rankedRatingCount >= 5
      );
    })
    .filter((track) => track.ratingsCount >= 4.99);

  qualifiedTracks.forEach((track) => {
    track.categoryAverages.forEach((ratingCategory: any) => {
      const rankedTracks = qualifiedTracks
        .map((candidate) => ({
          trackId: candidate.id,
          score:
            candidate.categoryAverages.find(
              (avg: any) => avg.categoryId === ratingCategory.categoryId,
            )?.averageScore ?? 0,
        }))
        .sort((a, b) => b.score - a.score);

      const placement = rankedTracks.findIndex(
        (candidate) => candidate.trackId === track.id,
      );
      ratingCategory.placement = placement + 1;
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

  return qualifiedTracks;
}
