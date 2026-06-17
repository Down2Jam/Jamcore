type RecommendationId = number | string;

type RecommendationEntry<TItemId extends RecommendationId = number> = {
  itemId: TItemId;
  value: number;
  tieBreakerValue?: number;
  updatedAt: Date | number;
};

type RecommendationComputation<TItemId extends RecommendationId = number> = {
  eligible: boolean;
  ratedCount: number;
  candidateIds: TItemId[];
  effectiveIds: TItemId[];
};

const normalizeTimestamp = (value: Date | number) =>
  value instanceof Date ? value.getTime() : value;

export function rankRecommendationCandidates<TItemId extends RecommendationId>(
  entries: RecommendationEntry<TItemId>[],
  minimumRatings?: number,
): RecommendationComputation<TItemId>;
export function rankRecommendationCandidates<TItemId extends RecommendationId>(
  entries: RecommendationEntry<TItemId>[],
  minimumRatings = 10,
): RecommendationComputation<TItemId> {
  const bestByItemId = new Map<TItemId, RecommendationEntry<TItemId>>();

  entries.forEach((entry) => {
    const current = bestByItemId.get(entry.itemId);
    if (
      !current ||
      entry.value > current.value ||
      (entry.value === current.value &&
        (entry.tieBreakerValue ?? Number.NEGATIVE_INFINITY) >
          (current.tieBreakerValue ?? Number.NEGATIVE_INFINITY)) ||
      (entry.value === current.value &&
        (entry.tieBreakerValue ?? Number.NEGATIVE_INFINITY) ===
          (current.tieBreakerValue ?? Number.NEGATIVE_INFINITY) &&
        normalizeTimestamp(entry.updatedAt) >
          normalizeTimestamp(current.updatedAt))
    ) {
      bestByItemId.set(entry.itemId, entry);
    }
  });

  const candidateIds = [...bestByItemId.values()]
    .sort(
      (a, b) =>
        b.value - a.value ||
        (b.tieBreakerValue ?? Number.NEGATIVE_INFINITY) -
          (a.tieBreakerValue ?? Number.NEGATIVE_INFINITY) ||
        normalizeTimestamp(b.updatedAt) - normalizeTimestamp(a.updatedAt) ||
        String(a.itemId).localeCompare(String(b.itemId)),
    )
    .map((entry) => entry.itemId);

  const ratedCount = bestByItemId.size;

  return {
    eligible: ratedCount >= minimumRatings,
    ratedCount,
    candidateIds,
    effectiveIds: [],
  };
}

export function applyRecommendationOverrides<TItemId extends RecommendationId>(
  candidateIds: TItemId[],
  overrideIds: TItemId[],
  hiddenIds: TItemId[],
  limit = 3,
): TItemId[] {
  return applyRecommendationOverridesInternal(
    candidateIds,
    overrideIds,
    hiddenIds,
    limit,
  );
}

function applyRecommendationOverridesInternal<TItemId extends RecommendationId>(
  candidateIds: TItemId[],
  overrideIds: TItemId[],
  hiddenIds: TItemId[],
  limit: number,
): TItemId[] {
  const hiddenSet = new Set(hiddenIds);
  const effectiveIds: TItemId[] = [];

  overrideIds.forEach((id) => {
    if (hiddenSet.has(id) || effectiveIds.includes(id)) return;
    effectiveIds.push(id);
  });

  candidateIds.forEach((id) => {
    if (effectiveIds.length >= limit) return;
    if (hiddenSet.has(id) || effectiveIds.includes(id)) return;
    effectiveIds.push(id);
  });

  return effectiveIds.slice(0, limit);
}
