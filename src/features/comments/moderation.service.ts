import { z } from "zod";

import db from "../../infra/db.js";
import { assertCommentTargetBelongsToTenant } from "../../lib/contentTenant.js";
import {
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";
import { cleanupNotificationsForComment } from "./thread.service.js";

export const deleteCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  mode: z.enum(["delete", "remove"]).optional().default("delete"),
});

type CommentModerationActor = {
  id: number;
  mod?: boolean | null;
  admin?: boolean | null;
};

export async function deleteCommentById({
  commentId,
  mode,
  actor,
  tenantId,
}: {
  commentId: number;
  mode: "delete" | "remove";
  actor: CommentModerationActor;
  tenantId?: string | null;
}) {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    include: {
      gamePage: {
        select: {
          game: {
            select: {
              id: true,
            },
          },
        },
      },
      track: {
        select: {
          gamePage: {
            select: {
              game: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!comment) {
    throw new NotFoundError("Comment not found.");
  }

  await assertCommentTargetBelongsToTenant(comment, tenantId);

  const isAuthor = comment.authorId === actor.id;
  const isModerator = Boolean(actor.mod || actor.admin);
  const isRemoval = mode === "remove";

  if (!isAuthor && !isModerator) {
    throw new ForbiddenError("Not allowed.");
  }

  if (isRemoval && !isModerator) {
    throw new ForbiddenError("Not allowed.");
  }

  await cleanupNotificationsForComment(commentId);

  await db.comment.update({
    where: { id: commentId },
    data: {
      deletedAt: !isRemoval ? new Date() : comment.deletedAt,
      removedAt: isRemoval ? new Date() : comment.removedAt,
    },
  });

  return isRemoval ? "Comment removed" : "Comment deleted";
}

