import { appConfig } from "../config/app.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { NotFoundError } from "./errors.js";

type CommentTenantTarget = {
  postId?: number | null;
  gameId?: number | null;
  gamePage?: {
    game?: {
      id: number;
    } | null;
  } | null;
  track?: {
    gamePage?: {
      game?: {
        id: number;
      } | null;
    } | null;
  } | null;
};

export async function assertPostBelongsToTenant(
  postId: number,
  tenantId?: string | null,
) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Post",
    entityId: postId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Post not found.");
  }
}

export async function assertGameBelongsToTenant(
  gameId: number,
  tenantId?: string | null,
) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: gameId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Game not found.");
  }
}

export async function assertCommentTargetBelongsToTenant(
  comment: CommentTenantTarget,
  tenantId?: string | null,
) {
  if (comment.postId) {
    await assertPostBelongsToTenant(comment.postId, tenantId);
    return;
  }

  const gameId =
    comment.gameId ??
    comment.gamePage?.game?.id ??
    comment.track?.gamePage?.game?.id ??
    null;

  if (gameId) {
    await assertGameBelongsToTenant(gameId, tenantId);
  }
}
