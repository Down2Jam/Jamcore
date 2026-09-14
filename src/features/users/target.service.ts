import { presentTargetUser } from "./target.presenter.js";
import { loadTargetUserRecommendations } from "./target.recommendations.js";
import { loadCommentDescendants } from "../comments/load-tree.js";

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

  await loadCommentDescendants(
    recommendationContext.user.posts.flatMap((post) => post.comments),
  );
  return presentTargetUser(recommendationContext);
}
