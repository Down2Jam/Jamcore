import { PageVersion } from "@prisma/client";
import { buildJamScoreVisibilityTimeline } from "../../domain/gamePolicies.js";

export function areRatingValuesPublic(
  jam: Parameters<typeof buildJamScoreVisibilityTimeline>[0],
  version: PageVersion = PageVersion.JAM,
  now = new Date(),
) {
  const timeline = buildJamScoreVisibilityTimeline(jam);
  if (!timeline) return false;
  const end = version === PageVersion.POST_JAM ? timeline.postJamRatingEnd : timeline.ratingEnd;
  return now >= end;
}
