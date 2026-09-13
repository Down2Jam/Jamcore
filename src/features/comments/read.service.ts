import { z } from "zod";
import type { Prisma } from "@prisma/client";
import db from "../../infra/db.js";
import { assertCommentTargetBelongsToTenant } from "../../lib/contentTenant.js";
import { NotFoundError } from "../../lib/errors.js";
import { isPrivilegedViewer, mapCommentsForViewer } from "./thread.service.js";

export const commentRepliesQuerySchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

export async function getCommentReplies({
  commentId,
  user,
  tenantId,
}: {
  commentId: number;
  user?: { id: number; mod?: boolean | null; admin?: boolean | null } | null;
  tenantId?: string | null;
}) {
  const privileged = isPrivilegedViewer(user);
  // Replies inherit visibility and tenant membership from their root target.
  const visited = new Set<number>();
  let ancestorId: number | null = commentId;
  while (ancestorId !== null) {
    if (visited.has(ancestorId)) throw new NotFoundError("Comment not found.");
    visited.add(ancestorId);
    const ancestor: Prisma.CommentGetPayload<{ include: {
      post: { select: { deletedAt: true; removedAt: true } };
      gamePage: { select: { game: { select: { id: true } } } };
      track: { select: { gamePage: { select: { game: { select: { id: true } } } } } };
    } }> | null = await db.comment.findUnique({
      where: { id: ancestorId },
      include: {
        post: { select: { deletedAt: true, removedAt: true } },
        gamePage: { select: { game: { select: { id: true } } } },
        track: { select: { gamePage: { select: { game: { select: { id: true } } } } } },
      },
    });
    if (!ancestor || (!privileged && (
      ancestor.deletedAt || ancestor.removedAt ||
      ancestor.post?.deletedAt || ancestor.post?.removedAt
    ))) {
      throw new NotFoundError("Comment not found.");
    }
    await assertCommentTargetBelongsToTenant(ancestor, tenantId);
    ancestorId = ancestor.commentId;
  }

  const replies = await db.comment.findMany({
    where: { commentId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      author: true,
      likes: true,
      commentReactions: {
        include: {
          reaction: true,
          user: { select: { id: true, slug: true, name: true, profilePicture: true } },
        },
      },
      children: { select: { id: true, deletedAt: true, removedAt: true } },
    },
  });
  return mapCommentsForViewer(replies, user?.id ?? null, privileged);
}
