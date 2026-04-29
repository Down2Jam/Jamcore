import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";

export type RecommendationContext = {
  overallGameCategoryId: number | null;
  overallTrackCategoryId: number | null;
  activeJamId: number | null;
};

export async function getRecommendationContext(): Promise<RecommendationContext> {
  const [overallGameCategory, overallTrackCategory, activeJam] =
    await Promise.all([
      db.ratingCategory.findFirst({
        where: { name: appConfig.games.ratingCategoryNames.overall },
        select: { id: true },
      }),
      db.trackRatingCategory.findFirst({
        where: { name: appConfig.games.ratingCategoryNames.overallTrack },
        select: { id: true },
      }),
      db.jam.findFirst({
        where: { isActive: true },
        orderBy: { id: "desc" },
        select: { id: true },
      }),
    ]);

  return {
    overallGameCategoryId: overallGameCategory?.id ?? null,
    overallTrackCategoryId: overallTrackCategory?.id ?? null,
    activeJamId: activeJam?.id ?? null,
  };
}
