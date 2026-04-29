import { GameCategory, PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { materializeGamePage } from "../games/page.helpers.js";
import {
  ODA_GAME_CATEGORY,
  OVERALL_RATING_CATEGORY_NAME,
  REGULAR_GAME_CATEGORY,
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

function getResultPageVersion(game: { pages?: Array<{ version: PageVersion }> }) {
  return game.pages?.some((page) => page.version === PageVersion.POST_JAM)
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

function ratingBelongsToResultVersion(
  rating: { gamePage?: { version?: PageVersion | null } | null },
  version: PageVersion,
) {
  const ratingVersion =
    rating.gamePage?.version === PageVersion.POST_JAM
      ? PageVersion.POST_JAM
      : PageVersion.JAM;
  return version === PageVersion.POST_JAM
    ? ratingVersion === PageVersion.JAM || ratingVersion === PageVersion.POST_JAM
    : ratingVersion === version;
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
}: {
  jamId?: number;
  category?: string;
  contentType?: string;
  sort?: string;
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

  const games = await db.game.findMany({
    where,
    include: {
      pages: {
        where: {
          version: {
            in: [PageVersion.JAM, PageVersion.POST_JAM],
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
          value: true,
          categoryId: true,
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

  const ratingCategories = await db.ratingCategory.findMany({
    where: {
      always: true,
    },
  });

  const computedGames = games
    .map((game) => {
      const resultPageVersion = getResultPageVersion(game);
      const resultPage = game.pages?.find(
        (page) => page.version === resultPageVersion,
      );
      if (!resultPage) return null;

      const materializedGame = materializeGamePage(game, resultPageVersion) as
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

      const filteredRatings = game.ratings.filter(
        (rating) =>
          ratingBelongsToResultVersion(rating, resultPageVersion) &&
          categoryIds.includes(rating.categoryId),
      );

      const categoryAverages = categories.map((ratingCategory) => {
        const categoryRatings = filteredRatings.filter(
          (rating) =>
            rating.categoryId === ratingCategory.id &&
            rating.user.teams.filter((team) => team.game?.published).length > 0,
        );

        const averageScore =
          categoryRatings.length > 0
            ? categoryRatings.reduce((sum, rating) => sum + rating.value, 0) /
              categoryRatings.length
            : 0;

        return {
          categoryId: ratingCategory.id,
          categoryName: ratingCategory.name,
          averageScore,
          ratingCount: categoryRatings.length,
          placement: -1,
        };
      });

      const computedGame: ResultGame = {
        ...materializedGame,
        ratingCategories: materializedGame.ratingCategories ?? [],
        majRatingCategories: materializedGame.majRatingCategories ?? [],
        pageVersion: resultPageVersion,
        categoryAverages,
        ratingsCount: game.team.users.reduce((totalRatings, user) => {
          const userRatingCount = user.ratings.reduce((count, rating) => {
            const ratingCategoryCount =
              rating.gamePage?.ratingCategories?.length ??
              rating.game.ratingCategories.length;

            return (
              count +
              (ratingBelongsToResultVersion(rating, resultPageVersion)
                ? 1 / (ratingCategoryCount + ratingCategories.length)
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
    .filter((game) => game.ratingsCount >= 4.99);

  qualifiedGames.forEach((game) => {
    game.categoryAverages.forEach((ratingCategory) => {
      const rankedGamesInCategory = qualifiedGames
        .slice()
        .sort((a, b) =>
          compareGamesByRawCategoryScore(
            a,
            b,
            ratingCategory.categoryId,
            ratingCategory.categoryName,
          ),
        );

      const gamePlacement = rankedGamesInCategory.findIndex(
        (rankedGame) => rankedGame.id === game.id,
      );

      ratingCategory.placement = gamePlacement + 1;
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
