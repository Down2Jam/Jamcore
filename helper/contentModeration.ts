import db from "@helper/db";

export function isPrivilegedViewer(
  user?: { mod?: boolean | null; admin?: boolean | null } | null
) {
  return Boolean(user?.mod || user?.admin);
}

export function mapCommentsForViewer(
  comments: any[] | undefined,
  viewerUserId: number | null,
  privileged: boolean
): any[] {
  return (comments ?? []).flatMap((comment) => {
    const children = mapCommentsForViewer(
      comment.children,
      viewerUserId,
      privileged
    );
    const mapped = {
      ...comment,
      hasLiked: Boolean(
        viewerUserId &&
          comment.likes?.some((like: { userId: number }) => like.userId === viewerUserId)
      ),
      children,
    };

    if ((comment.deletedAt || comment.removedAt) && !privileged) {
      return [];
    }

    return [mapped];
  });
}

async function collectDescendantCommentIds(parentIds: number[]): Promise<number[]> {
  const allIds = [...parentIds];
  let frontier = [...parentIds];

  while (frontier.length > 0) {
    const children = await db.comment.findMany({
      where: {
        commentId: {
          in: frontier,
        },
      },
      select: {
        id: true,
      },
    });

    const next = children.map((comment) => comment.id);
    if (next.length === 0) {
      break;
    }

    allIds.push(...next);
    frontier = next;
  }

  return allIds;
}

export async function collectPostCommentIds(postId: number) {
  const rootComments = await db.comment.findMany({
    where: { postId },
    select: { id: true },
  });

  return collectDescendantCommentIds(rootComments.map((comment) => comment.id));
}

export async function collectCommentThreadIds(commentId: number) {
  return collectDescendantCommentIds([commentId]);
}

export async function cleanupNotificationsForPost(postId: number) {
  const commentIds = await collectPostCommentIds(postId);

  await db.notification.deleteMany({
    where: {
      OR: [
        { postId },
        ...(commentIds.length > 0 ? [{ commentId: { in: commentIds } }] : []),
      ],
    },
  });
}

export async function cleanupNotificationsForComment(commentId: number) {
  const commentIds = await collectCommentThreadIds(commentId);

  await db.notification.deleteMany({
    where: {
      commentId: {
        in: commentIds,
      },
    },
  });
}
