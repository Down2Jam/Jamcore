export function rankedGameRatings<T extends { rankedValue: number | null }>(ratings: T[]) {
  return ratings.filter((rating) => rating.rankedValue != null)
    .map((rating) => ({ ...rating, value: rating.rankedValue! }));
}
