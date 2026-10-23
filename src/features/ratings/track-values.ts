// A merged score gives each person one vote per category, preferring the displayed post-jam version.
export function latestTrackRatings<T extends { userId: number; categoryId: number; updatedAt: Date; id?: number; trackPageVersion?: string }>(ratings: T[]): T[] {
  const latest = new Map<string, T>();
  for (const rating of ratings) {
    const key = rating.userId + ":" + rating.categoryId;
    const previous = latest.get(key);
    const priority = rating.trackPageVersion === "POST_JAM" ? 1 : 0;
    const previousPriority = previous?.trackPageVersion === "POST_JAM" ? 1 : 0;
    const newer = previous && (new Date(rating.updatedAt).getTime() > new Date(previous.updatedAt).getTime() ||
      (new Date(rating.updatedAt).getTime() === new Date(previous.updatedAt).getTime() && (rating.id ?? 0) > (previous.id ?? 0)));
    if (!previous || priority > previousPriority || (priority === previousPriority && newer)) {
      latest.set(key, rating);
    }
  }
  return [...latest.values()];
}

export function rankedTrackRatings<T extends { userId: number; categoryId: number; value: number; updatedAt: Date; rankedValue?: number | null; rankedUpdatedAt?: Date | null }>(ratings: T[]): T[] {
  return latestTrackRatings(ratings.filter(rating => rating.rankedValue != null).map(rating => ({
    ...rating,
    value: rating.rankedValue!,
    updatedAt: rating.rankedUpdatedAt ?? rating.updatedAt,
  })));
}
