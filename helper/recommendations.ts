type RecommendationEntry = {
  itemId: number;
  value: number;
  tieBreakerValue?: number;
  updatedAt: Date | number;
};

type RecommendationComputation = {
  eligible: boolean;
  ratedCount: number;
  candidateIds: number[];
  effectiveIds: number[];
};

const normalizeTimestamp = (value: Date | number) =>
  value instanceof Date ? value.getTime() : value;

export function rankRecommendationCandidates(
  entries: RecommendationEntry[],
  minimumRatings = 10,
): RecommendationComputation {
  const bestByItemId = new Map<number, RecommendationEntry>();

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
        a.itemId - b.itemId,
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

export function applyRecommendationOverrides(
  candidateIds: number[],
  overrideIds: number[],
  hiddenIds: number[],
  limit = 3,
): number[] {
  const hiddenSet = new Set(hiddenIds);
  const effectiveIds: number[] = [];

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
