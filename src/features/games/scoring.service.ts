import { rankedGameRatings } from "../ratings/game-values.js";
import { calculatePostJamScore } from "../ratings/post-jam-score.js";
import { activeRatingSelect, activeRatingPageSelect, isActiveGameRating, getGameRatingCategoryCount } from "../ratings/active.js";
import { GameCategory, PageVersion } from "@prisma/client";
import type { CategoryAverage, ScoreSummary } from "../../types/game.js";

import db from "../../infra/db.js";
import {
  OVERALL_RATING_CATEGORY_NAME,
  REGULAR_GAME_CATEGORY,
  isNonCompetitiveGameCategory,
} from "./policies.js";
import { materializeGamePage } from "./page.helpers.js";

type RatingCategoryRef = {
  gamePage?: {
    version?: PageVersion | null;
    ratingCategories?: Array<{ id: number }>;
  } | null;
  game?: { ratingCategories?: Array<{ id: number }> } | null;
};

type ScoreGameRef = {
  id: number;
  jamId: number;
  category: GameCategory;
};

function getRatingCategoryCount(rating: RatingCategoryRef) {
  return (
    rating?.gamePage?.ratingCategories?.length ??
    rating?.game?.ratingCategories?.length ??
    0
  );
}

function ratingBelongsToScoreVersion(rating: RatingCategoryRef, version: PageVersion) {
  const ratingVersion =
    rating.gamePage?.version === PageVersion.POST_JAM
      ? PageVersion.POST_JAM
      : PageVersion.JAM;
  return ratingVersion === version;
}

function categoryScore(
  game: { id: number; categoryAverages: CategoryAverage[] },
  categoryId: number,
  categoryName?: string,
) {
  const categoryAverage = game.categoryAverages.find((avg) =>
    categoryId >= 0
      ? avg.categoryId === categoryId
      : avg.categoryName === categoryName,
  );
  return categoryAverage?.averageScore ?? 0;
}

function categoryRatingCount(
  game: { id: number; categoryAverages: CategoryAverage[] },
  categoryId: number,
  categoryName?: string,
) {
  const categoryAverage = game.categoryAverages.find((avg) =>
    categoryId >= 0
      ? avg.categoryId === categoryId
      : avg.categoryName === categoryName,
  );
  return categoryAverage?.ratingCount ?? 0;
}

function compareGamesByRawCategoryScore(
  a: { id: number; categoryAverages: CategoryAverage[] },
  b: { id: number; categoryAverages: CategoryAverage[] },
  categoryId: number,
  categoryName?: string,
) {
  const scoreDiff =
    categoryScore(b, categoryId, categoryName) -
    categoryScore(a, categoryId, categoryName);
  if (scoreDiff !== 0) return scoreDiff;

  const countDiff =
    categoryRatingCount(b, categoryId, categoryName) -
    categoryRatingCount(a, categoryId, categoryName);
  if (countDiff !== 0) return countDiff;

  const overallDiff =
    categoryScore(b, -1, OVERALL_RATING_CATEGORY_NAME) -
    categoryScore(a, -1, OVERALL_RATING_CATEGORY_NAME);
  if (overallDiff !== 0) return overallDiff;

  return a.id - b.id;
}

export async function buildVersionScores({
  game,
  version,
}: {
  game: ScoreGameRef;
  version: PageVersion;
}) {
  const scores: Record<string, ScoreSummary> = {};

  const games = await db.game.findMany({
    where: {
      ...(version === PageVersion.POST_JAM ? { id: game.id } : {}),
      jamId: game.jamId,
      category: game.category,
      published: true,
    },
    include: {
      ratingCategories: true,
      majRatingCategories: true,
      pages: {
        where: {
          version: {
            in:
              version === PageVersion.POST_JAM
                ? [PageVersion.JAM, PageVersion.POST_JAM]
                : [version],
          },
        },
        include: {
          ratingCategories: true,
          majRatingCategories: true,
        },
      },
      team: {
        select: {
          users: {
            where: version === PageVersion.POST_JAM ? { id: { in: [] } } : {},
            select: {
              ratings: {
                select: {
                  ...activeRatingSelect,
                  rankedValue: true,
                  gamePage: {
                    select: {
                      version: true,
                      gameId: true,
                      ratingCategories: {
                        select: {
                          id: true,
                        },
                      },
                      game: {
                        select: {
                          jamId: true,
                          ratingCategories: {
                            select: {
                              id: true,
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
          categoryId: true,
          gamePage: {
            select: {
              ...activeRatingPageSelect,
              version: true,
              gameId: true,
              game: {
                select: {
                  jamId: true,
                  category: true,
                  published: true,
                },
              },
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
  });

  const allCategories = await db.ratingCategory.findMany();
  const categoriesById = new Map(allCategories.map((entry) => [entry.id, entry]));
  const alwaysCategories = allCategories.filter((entry) => entry.always);

  const filteredGames = games.map((loadedGame) => {
    const hasSelectedPage = loadedGame.pages.some((page) => page.version === version);
    const materializedGame = materializeGamePage(loadedGame, version);
    const selectedCategoryIds =
      materializedGame.ratingCategories?.map((entry: { id: number }) => entry.id) ??
      loadedGame.ratingCategories.map((entry) => entry.id);
    const selectedMajIds =
      materializedGame.majRatingCategories?.map((entry: { id: number }) => entry.id) ??
      loadedGame.majRatingCategories.map((entry) => entry.id);

    const selectedCategories = selectedCategoryIds
      .map((id: number) => categoriesById.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const categories = [
      ...selectedCategories,
      ...alwaysCategories.filter(
        (entry) => !selectedCategoryIds.includes(entry.id),
      ),
    ];
    const categoryIds = categories.map((entry) => entry.id);

    const filteredRatings = loadedGame.ratings.filter(
      (rating) =>
        isActiveGameRating(rating) &&
        (version === PageVersion.POST_JAM || ratingBelongsToScoreVersion(rating, version)) &&
        categoryIds.includes(rating.categoryId),
    );

    const publishedRatings = rankedGameRatings(filteredRatings).filter((rating) =>
      rating.user.teams.some((team) => {
        const candidateGame = team.game;
        return (
          candidateGame &&
          candidateGame.published &&
          candidateGame.jamId === game.jamId &&
          !isNonCompetitiveGameCategory(candidateGame.category)
        );
      }),
    );

    const categoryAverages: CategoryAverage[] = categories
      .filter((category) => version !== PageVersion.POST_JAM || category.name === OVERALL_RATING_CATEGORY_NAME)
      .filter(
        (category) =>
          !category.askMajorityContent ||
          materializedGame.category !== REGULAR_GAME_CATEGORY ||
          !selectedCategoryIds.includes(category.id) ||
          selectedMajIds.includes(category.id),
      )
      .map((category) => {
        const categoryRatings = filteredRatings.filter(
          (rating) => rating.categoryId === category.id && ratingBelongsToScoreVersion(rating, version),
        );
        const categoryPublishedRatings = publishedRatings.filter(
          (rating) => rating.categoryId === category.id,
        );

        const averageRating =
          categoryRatings.length > 0
            ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
              categoryRatings.length
            : 0;

        const rankedScore = version === PageVersion.POST_JAM
          ? calculatePostJamScore(
              categoryPublishedRatings.filter((rating) => rating.gamePage?.version === PageVersion.POST_JAM),
              categoryPublishedRatings.filter((rating) => rating.gamePage?.version === PageVersion.JAM),
            )
          : {
              averageScore: categoryPublishedRatings.length
                ? categoryPublishedRatings.reduce((sum, rating) => sum + rating.value, 0) / categoryPublishedRatings.length
                : 0,
              ratingCount: categoryPublishedRatings.length,
            };

        return {
          categoryId: category.id,
          categoryName: category.name,
          averageScore: rankedScore.averageScore,
          averageUnrankedScore: averageRating,
          ratingCount: rankedScore.ratingCount,
          placement: -1,
        };
      });

    return {
      ...materializedGame,
      hasSelectedPage,
      categoryAverages,
      ratingsCount: loadedGame.team.users.reduce((totalRatings, user) => {
        const userRatingCount = user.ratings.reduce((count, rating) => {
          if (rating.rankedValue == null || rating.gamePage?.game?.jamId !== game.jamId || !isActiveGameRating(rating) || !ratingBelongsToScoreVersion(rating, version)) return count;
          return (
            count +
            1 / getGameRatingCategoryCount(rating.gamePage?.version, getRatingCategoryCount(rating), alwaysCategories.length)
          );
        }, 0);
        return totalRatings + userRatingCount;
      }, 0),
    };
  });

  const versionFilteredGames = filteredGames.filter(
    (entry) => entry.hasSelectedPage,
  );

  const rankedGames = versionFilteredGames
    .filter(() => version === PageVersion.JAM)
    .filter((entry) => {
      const overallCategory = entry.categoryAverages.find(
        (avg: CategoryAverage) =>
          avg.categoryName === OVERALL_RATING_CATEGORY_NAME,
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    })
    .filter((entry) => Math.round(entry.ratingsCount) >= 5);

  if (!isNonCompetitiveGameCategory(game.category)) {
    const placementsByCategory = new Map<number, Map<number, number>>();
    for (const entry of rankedGames) {
      for (const category of entry.categoryAverages) {
        let placements = placementsByCategory.get(category.categoryId);
        if (!placements) {
          const sorted = [...rankedGames].sort((a, b) =>
            compareGamesByRawCategoryScore(a, b, category.categoryId, category.categoryName),
          );
          placements = new Map(sorted.map((candidate, index) => [candidate.id, index + 1]));
          placementsByCategory.set(category.categoryId, placements);
        }
        category.placement = placements.get(entry.id) ?? -1;
      }
    }
  }

  const rankedTarget = rankedGames.find((entry) => entry.id === game.id);
  if (rankedTarget) {
    rankedTarget.categoryAverages.forEach((category: CategoryAverage) => {
      if (category.ratingCount >= 5) {
        scores[category.categoryName] ??= {};
        scores[category.categoryName].placement = category.placement;
      }
    });
  }

  const target = versionFilteredGames.find((entry) => entry.id === game.id);
  if (target) {
    target.categoryAverages.forEach((category: CategoryAverage) => {
      scores[category.categoryName] ??= {};
      scores[category.categoryName].averageScore = category.averageScore;
      scores[category.categoryName].ratingCount = category.ratingCount;
      scores[category.categoryName].averageUnrankedScore =
        category.averageUnrankedScore;
    });
  }

  return scores;
}
