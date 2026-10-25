export function calculatePostJamScore(
  postJamRatings: Array<{ value: number }>,
  jamRatings: Array<{ value: number }>,
) {
  const jamFillCount = Math.min(Math.max(0, 5 - postJamRatings.length), jamRatings.length);
  const jamAverage = jamRatings.length
    ? jamRatings.reduce((sum, rating) => sum + rating.value, 0) / jamRatings.length
    : 0;
  const ratingCount = postJamRatings.length + jamFillCount;
  const total = postJamRatings.reduce((sum, rating) => sum + rating.value, 0) + jamFillCount * jamAverage;

  return {
    averageScore: ratingCount ? total / ratingCount : 0,
    ratingCount,
    postJamRatingCount: postJamRatings.length,
    jamFillCount,
  };
}
