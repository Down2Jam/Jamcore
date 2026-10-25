import { appConfig } from "../../config/app.js";

export function getGameRatingCategoryCount(
  version: string | null | undefined,
  selectedCategoryCount: number,
  alwaysCategoryCount: number,
) {
  return version === "POST_JAM" ? 1 : selectedCategoryCount + alwaysCategoryCount;
}


// Disabled categories retain their votes for re-enabling, but never contribute
// to active rating totals, completion, recommendations, or ranking credit.
export function isActiveGameRating(rating: {
  categoryId: number;
  category?: { always: boolean; name?: string } | null;
  gamePage?: { version?: string; ratingCategories?: Array<{ id: number }> } | null;
}) {
  if (rating.gamePage?.version === "POST_JAM") {
    return rating.category?.name === appConfig.games.ratingCategoryNames.overall;
  }

  return Boolean(
    rating.category?.always ||
      rating.gamePage?.ratingCategories?.some(
        (category) => category.id === rating.categoryId,
      ),
  );
}

export const activeRatingSelect = {
  categoryId: true,
  category: { select: { always: true, name: true } },
} as const;

export const activeRatingPageSelect = {
  version: true,
  ratingCategories: { select: { id: true } },
} as const;
