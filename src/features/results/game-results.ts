import { rankedGameRatings } from "../ratings/game-values.js";
import { activeRatingSelect, activeRatingPageSelect, isActiveGameRating, getGameRatingCategoryCount } from "../ratings/active.js";
import { GameCategory, PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { areRatingValuesPublic } from "../ratings/visibility.js";
import { materializeGamePage } from "../games/page.helpers.js";
import {
  OVERALL_RATING_CATEGORY_NAME,
  REGULAR_GAME_CATEGORY,
  isAllowedJamRater,
} from "../games/policies.js";

type ResultCategory = {
  id: number;
  name: string;
  askMajorityContent?: boolean;
};

type ResultGame = {
  id: number;
  category: GameCategory;
  ratingCategories: ResultCategory[];
  majRatingCategories: Array<{ id: number }>;
  categoryAverages: Array<{
    categoryId: number;
    categoryName: string;
    averageScore: number;
    ratingCount: number;
    placement: number;
  }>;
  ratingsCount: number;
  pageVersion: PageVersion;
};

function isAllowedResultRater(
  rating: {
    user: {
      teams: Array<{
        game: {
          published: boolean;
          jamId?: number | null;
          category?: GameCategory | null;
        } | null;
      }>;
    };
  },
  jamId: number,
) {
  return rating.user.teams.some((team) => {
    return isAllowedJamRater(team.game, jamId);
  });
}

function gameSortCategoryName(sort?: string) {
  switch (sort) {
    case "GAMEPLAY":
      return "RatingCategory.Gameplay.Title";
    case "AUDIO":
      return "RatingCategory.Audio.Title";
    case "GRAPHICS":
      return "RatingCategory.Graphics.Title";
    case "CREATIVITY":
      return "RatingCategory.Creativity.Title";
    case "EMOTIONALDELIVERY":
      return "RatingCategory.Emotional.Title";
    case "THEME":
      return "RatingCategory.Theme.Title";
    case "OVERALL":
    default:
      return OVERALL_RATING_CATEGORY_NAME;
  }
}

function categoryScore(
  game: ResultGame,
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
  game: ResultGame,
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
  a: ResultGame,
  b: ResultGame,
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

export async function loadGameResults({
  jamId,
  category,
  contentType,
  sort,
  adminPreview = false,
}: {
  jamId?: number;
  category?: string;
  contentType?: string;
  sort?: string;
  adminPreview?: boolean;
}) {
  const where: {
    category?: GameCategory;
    published: true;
    jamId?: number;
  } = {
    category: category as GameCategory,
    published: true,
  };

  if (typeof jamId === "number") {
    where.jamId = jamId;
  }

  const loadedGames = await db.game.findMany({
    where,
    include: {
      jam: true,
      pages: {
        where: {
          version: {
            in: [PageVersion.JAM],
          },
        },
        include: {
          ratingCategories: true,
          majRatingCategories: true,
          tags: true,
          flags: true,
          downloadLinks: true,
          achievements: true,
          leaderboards: true,
          comments: true,
        },
      },
      team: {
        select: {
          users: {
            select: {
              ratings: {
                select: {
                  ...activeRatingSelect,
                  rankedValue: true,
                  gamePage: {
                    select: {
                      version: true,
                      ratingCategories: {
                        select: {
                          id: true,
                        },
                      },
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
            },
          },
          user: {
            select: {
              teams: {
                select: {
                  game: {
                    select: {
                      published: true,
                      jamId: true,
                      category: true,
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

  const now = new Date();
  const games = loadedGames
    .filter((game) => adminPreview || areRatingValuesPublic(game.jam, PageVersion.JAM, now))
    .map((game) => ({
    ...game,
    pages: game.pages.filter((page) => page.version === PageVersion.JAM),
    ratings: game.ratings.filter((rating) => (rating.gamePage?.version ?? PageVersion.JAM) === PageVersion.JAM),
  }));

  const ratingCategories = await db.ratingCategory.findMany({
    where: {
      always: true,
    },
  });

  const computedGames = games
    .map((game) => {
      const resultPage = game.pages?.find(
        (page) => page.version === PageVersion.JAM,
      );
      if (!resultPage) return null;

      const materializedGame = materializeGamePage(game, PageVersion.JAM) as
        typeof game & {
          ratingCategories?: ResultCategory[];
          majRatingCategories?: Array<{ id: number }>;
        };
      let categories = [
        ...(materializedGame.ratingCategories ?? []),
        ...ratingCategories,
      ];
      if (
        contentType === "MAJORITYCONTENT" &&
        game.category === REGULAR_GAME_CATEGORY
      ) {
        categories = categories.filter(
          (ratingCategory) =>
            !ratingCategory.askMajorityContent ||
            (materializedGame.majRatingCategories ?? [])
              .map((cat) => cat.id)
              .includes(ratingCategory.id),
        );
      }
      const categoryIds = categories.map((ratingCategory) => ratingCategory.id);

      const filteredRatings = rankedGameRatings(game.ratings).filter(
        (rating) =>
          isActiveGameRating(rating) &&
          categoryIds.includes(rating.categoryId),
      );

      const categoryAverages = categories.map((ratingCategory) => {
        const categoryRatings = filteredRatings.filter(
          (rating) =>
            rating.categoryId === ratingCategory.id &&
            isAllowedResultRater(rating, game.jamId),
        );

        const score = {
          averageScore: categoryRatings.length
            ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) / categoryRatings.length
            : 0,
          ratingCount: categoryRatings.length,
        };

        return {
          categoryId: ratingCategory.id,
          categoryName: ratingCategory.name,
          averageScore: score.averageScore,
          ratingCount: score.ratingCount,
          placement: -1,
        };
      });

      const computedGame: ResultGame = {
        ...materializedGame,
        ratingCategories: materializedGame.ratingCategories ?? [],
        majRatingCategories: materializedGame.majRatingCategories ?? [],
        pageVersion: PageVersion.JAM,
        categoryAverages,
        ratingsCount: game.team.users.reduce((totalRatings, user) => {
          const userRatingCount = user.ratings.reduce((count, rating) => {
            const ratingCategoryCount =
              rating.gamePage?.ratingCategories?.length ??
              rating.game.ratingCategories.length;

            return (
              count +
              (rating.rankedValue != null && rating.game.jamId === game.jamId && isActiveGameRating(rating) && (rating.gamePage?.version ?? PageVersion.JAM) === PageVersion.JAM
                ? 1 / getGameRatingCategoryCount(rating.gamePage?.version, ratingCategoryCount, ratingCategories.length)
                : 0)
            );
          }, 0);
          return totalRatings + userRatingCount;
        }, 0),
      };
      return computedGame;
    })
    .filter((game): game is ResultGame => Boolean(game));

  const qualifiedGames = computedGames
    .filter((game) => {
      const overallCategory = game.categoryAverages.find(
        (avg) => avg.categoryName === OVERALL_RATING_CATEGORY_NAME,
      );
      return overallCategory && overallCategory.ratingCount >= 5;
    })
    .filter((game) => Math.round(game.ratingsCount) >= 5);

  const placementsByCategory = new Map<string, Map<number, number>>();
  qualifiedGames.forEach((game) => {
    game.categoryAverages.forEach((ratingCategory) => {
      const key = `${ratingCategory.categoryId}:${ratingCategory.categoryName}`;
      let placements = placementsByCategory.get(key);

      if (!placements) {
        const rankedGames = qualifiedGames.slice().sort((a, b) =>
          compareGamesByRawCategoryScore(
            a,
            b,
            ratingCategory.categoryId,
            ratingCategory.categoryName,
          ),
        );
        placements = new Map(rankedGames.map((rankedGame, index) => [rankedGame.id, index + 1]));
        placementsByCategory.set(key, placements);
      }

      ratingCategory.placement = placements.get(game.id) ?? -1;
    });
  });

  const sortCategoryName = gameSortCategoryName(sort);

  qualifiedGames.forEach((game) => {
    game.categoryAverages = game.categoryAverages.filter(
      (ratingCategory) => ratingCategory.ratingCount >= 5,
    );
  });

  qualifiedGames.sort((a, b) => {
    const sortCategory = a.categoryAverages.find(
      (avg) => avg.categoryName === sortCategoryName,
    );
    return compareGamesByRawCategoryScore(
      a,
      b,
      sortCategory?.categoryId ?? -1,
      sortCategoryName,
    );
  });

  return qualifiedGames.filter((game) => {
    const overallCategory = game.categoryAverages.find(
      (avg) => avg.categoryName === sortCategoryName,
    );
    return overallCategory && overallCategory.ratingCount >= 5;
  });
}
