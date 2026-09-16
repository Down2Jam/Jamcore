// Disabled categories retain their votes for re-enabling, but never contribute
// to active rating totals, completion, recommendations, or ranking credit.
export function isActiveGameRating(rating: {
  categoryId: number;
  category?: { always: boolean } | null;
  gamePage?: { ratingCategories?: Array<{ id: number }> } | null;
}) {
  return Boolean(
    rating.category?.always ||
      rating.gamePage?.ratingCategories?.some(
        (category) => category.id === rating.categoryId,
      ),
  );
}

export const activeRatingSelect = {
  categoryId: true,
  category: { select: { always: true } },
} as const;

export const activeRatingPageSelect = {
  ratingCategories: { select: { id: true } },
} as const;
