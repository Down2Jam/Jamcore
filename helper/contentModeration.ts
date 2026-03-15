import db from "@helper/db";

const buildCommentReactionSummary = (
  reactions: Array<{
    reaction: any;
    userId: number;
    reactionId: number;
    createdAt?: Date;
    user?: { id: number; slug: string; name: string; profilePicture?: string | null };
  }>,
  userId: number | null,
) => {
  const summaryMap = new Map<
    number,
    {
      reaction: any;
      count: number;
      reacted: boolean;
      firstReactionAt: Date | null;
      firstReactorUserId: number | null;
      users: Array<{
        id: number;
        slug: string;
        name: string;
        profilePicture?: string | null;
      }>;
    }
  >();

  for (const entry of reactions) {
    const current = summaryMap.get(entry.reactionId) ?? {
      reaction: entry.reaction,
      count: 0,
      reacted: false,
      firstReactionAt: null,
      firstReactorUserId: null,
      users: [],
    };
    current.count += 1;
    if (userId && entry.userId === userId) {
      current.reacted = true;
    }
    if (
      !current.firstReactionAt ||
      (entry.createdAt && entry.createdAt < current.firstReactionAt)
    ) {
      current.firstReactionAt = entry.createdAt ?? null;
      current.firstReactorUserId = entry.userId;
    }
    if (entry.user) {
      current.users.push(entry.user);
    }
    summaryMap.set(entry.reactionId, current);
  }

  return Array.from(summaryMap.values())
    .map((summary) => ({
      reaction: summary.reaction,
      count: summary.count,
      reacted: summary.reacted,
      isFirstReactor:
        Boolean(userId) && summary.firstReactorUserId === userId,
      users: summary.users
        .filter(
          (user, index, self) =>
            self.findIndex((u) => u.id === user.id) === index,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.reaction.slug.localeCompare(b.reaction.slug);
    });
};

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
      reactions: buildCommentReactionSummary(
        comment.commentReactions ?? [],
        viewerUserId,
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

export async function collectTrackCommentIds(trackId: number) {
  const rootComments = await db.comment.findMany({
    where: { trackId },
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

export async function cleanupNotificationsForTrack(trackId: number) {
  const commentIds = await collectTrackCommentIds(trackId);

  await db.notification.deleteMany({
    where: {
      OR: [
        { trackId },
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
