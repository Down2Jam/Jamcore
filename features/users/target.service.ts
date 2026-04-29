import { presentTargetUser } from "./target.presenter.js";
import { loadTargetUserRecommendations } from "./target.recommendations.js";

export async function loadTargetUserContext({
  targetUserId,
  targetUserSlug,
}: {
  targetUserId?: number;
  targetUserSlug?: string;
}) {
  const recommendationContext = await loadTargetUserRecommendations({
    targetUserId,
    targetUserSlug,
  });

  if (!recommendationContext) {
    return null;
  }

  return presentTargetUser(recommendationContext);
}
