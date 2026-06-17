import { GameCategory, PageVersion } from "@prisma/client";
import type { CategoryAverage, ScoreSummary } from "../../types/game.js";

import db from "../../infra/db.js";
import {
  EXTRA_GAME_CATEGORY,
  OVERALL_RATING_CATEGORY_NAME,
  REGULAR_GAME_CATEGORY,
} from "./policies.js";
import { materializeGamePage } from "./page.helpers.js";
import { getRatingPageVersion } from "./page.service.js";

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
            select: {
              ratings: {
                select: {
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
                          ratingCategories: {
                            select: {
                              id: true,
                            },
                          },
                          pages: {
                            where: {
                              version: {
                                in:
                                  version === PageVersion.POST_JAM
                                    ? [PageVersion.JAM, PageVersion.POST_JAM]
                                    : [version],
                              },
                            },
                            select: {
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
        },
      },
      ratings: {
        select: {
          value: true,
          categoryId: true,
          gamePage: {
            select: {
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
    const hasSelectedPage = loadedGame.pages.length > 0;
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
        ratingBelongsToScoreVersion(rating, version) &&
        categoryIds.includes(rating.categoryId),
    );

    const publishedRatings = filteredRatings.filter((rating) =>
      rating.user.teams.some((team) => {
        const candidateGame = team.game;
        return (
          candidateGame &&
          candidateGame.published &&
          candidateGame.jamId === game.jamId &&
          candidateGame.category !== EXTRA_GAME_CATEGORY
        );
      }),
    );

    const categoryAverages: CategoryAverage[] = categories
      .filter(
        (category) =>
          !category.askMajorityContent ||
          materializedGame.category !== REGULAR_GAME_CATEGORY ||
          !selectedCategoryIds.includes(category.id) ||
          selectedMajIds.includes(category.id),
      )
      .map((category) => {
        const categoryRatings = filteredRatings.filter(
          (rating) => rating.categoryId === category.id,
        );
        const categoryPublishedRatings = publishedRatings.filter(
          (rating) => rating.categoryId === category.id,
        );

        const averageRating =
          categoryRatings.length > 0
            ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
              categoryRatings.length
            : 0;

        const averagePublishedRating =
          categoryPublishedRatings.length > 0
            ? categoryPublishedRatings.reduce(
                (sum, rating) => sum + rating.value,
                0,
              ) / categoryPublishedRatings.length
            : 0;

        return {
          categoryId: category.id,
          categoryName: category.name,
          averageScore: averagePublishedRating,
          averageUnrankedScore: averageRating,
          ratingCount: categoryRatings.length,
          placement: -1,
        };
      });

    return {
      ...materializedGame,
      hasSelectedPage,
      categoryAverages,
      ratingsCount: loadedGame.team.users.reduce((totalRatings, user) => {
        const userRatingCount = user.ratings.reduce((count, rating) => {
          if (!ratingBelongsToScoreVersion(rating, version)) return count;
          return (
            count +
            1 / (getRatingCategoryCount(rating) + alwaysCategories.length)
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
    .filter((entry) => {
      const overallCategory = entry.categoryAverages.find(
        (avg: CategoryAverage) =>
          avg.categoryName === OVERALL_RATING_CATEGORY_NAME,
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    })
    .filter((entry) => entry.ratingsCount >= 4.99);

  if (game.category !== EXTRA_GAME_CATEGORY) {
    rankedGames.forEach((entry) => {
      entry.categoryAverages.forEach((category: CategoryAverage) => {
        const rankedGamesInCategory = rankedGames
          .slice()
          .sort((a, b) =>
            compareGamesByRawCategoryScore(
              a,
              b,
              category.categoryId,
              category.categoryName,
            ),
          );

        const gamePlacement = rankedGamesInCategory.findIndex(
          (rankedGame) => rankedGame.id === entry.id,
        );

        category.placement = gamePlacement + 1;
      });
    });
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
