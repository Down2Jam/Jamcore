import { z } from "zod";

import db from "../../infra/db.js";
import {
  assertCommentTargetBelongsToTenant,
  assertPostBelongsToTenant,
} from "../../lib/contentTenant.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";

const reactionSummaryUserSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  profilePicture: z.string().nullable().optional(),
});

export const togglePostReactionSchema = z
  .object({
    postId: z.coerce.number().int().positive().optional(),
    postSlug: z.string().trim().min(1).optional(),
    reactionId: z.coerce.number().int().positive().optional(),
    reactionSlug: z.string().trim().min(1).optional(),
  })
  .refine((payload) => payload.postId !== undefined || payload.postSlug !== undefined, {
    message: "Post id or slug is required.",
  })
  .refine(
    (payload) => payload.reactionId !== undefined || payload.reactionSlug !== undefined,
    {
      message: "Reaction id or slug is required.",
    },
  );

export const toggleCommentReactionSchema = z
  .object({
    commentId: z.coerce.number().int().positive(),
    reactionId: z.coerce.number().int().positive().optional(),
    reactionSlug: z.string().trim().min(1).optional(),
  })
  .refine(
    (payload) => payload.reactionId !== undefined || payload.reactionSlug !== undefined,
    {
      message: "Reaction id or slug is required.",
    },
  );

export async function toggleLike({
  userId,
  postId,
  commentId,
}: {
  userId: number;
  postId?: number;
  commentId?: number;
}) {
  const thingKey = postId ? "postId" : "commentId";
  const thingId = postId ?? commentId;

  if (!thingId) {
    throw new NotFoundError("Post or comment not found.");
  }

  const conflictLike = await db.like.findFirst({
    where: {
      userId,
      [thingKey]: thingId,
    },
  });

  if (conflictLike) {
    await db.like.deleteMany({
      where: {
        userId,
        [thingKey]: thingId,
      },
    });
    return { liked: false };
  }

  await db.like.create({
    data: {
      userId,
      [thingKey]: thingId,
    },
  });

  return { liked: true };
}

type ReactionEntry = {
  reactionId: number;
  userId: number;
  createdAt: Date;
  reaction: {
    id?: number;
    slug: string;
  };
  user: z.infer<typeof reactionSummaryUserSchema>;
};

function buildReactionSummary(updated: ReactionEntry[], userId: number) {
  const summaryMap = new Map<
    number,
    {
      reaction: ReactionEntry["reaction"];
      count: number;
      reacted: boolean;
      firstReactionAt: Date | null;
      firstReactorUserId: number | null;
      users: z.infer<typeof reactionSummaryUserSchema>[];
    }
  >();

  for (const entry of updated) {
    const current = summaryMap.get(entry.reactionId) ?? {
      reaction: entry.reaction,
      count: 0,
      reacted: false,
      firstReactionAt: null,
      firstReactorUserId: null,
      users: [],
    };
    current.count += 1;
    if (entry.userId === userId) {
      current.reacted = true;
    }
    if (!current.firstReactionAt || entry.createdAt < current.firstReactionAt) {
      current.firstReactionAt = entry.createdAt;
      current.firstReactorUserId = entry.userId;
    }
    current.users.push(entry.user);
    summaryMap.set(entry.reactionId, current);
  }

  return Array.from(summaryMap.values())
    .map((summary) => ({
      reaction: summary.reaction,
      count: summary.count,
      reacted: summary.reacted,
      isFirstReactor: summary.firstReactorUserId === userId,
      users: summary.users
        .filter(
          (user, index, self) =>
            self.findIndex((candidate) => candidate.id === user.id) === index,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.reaction.slug.localeCompare(b.reaction.slug);
    });
}

function assertFirstReactorLimit(entries: Array<{ reactionId: number; userId: number }>, userId: number) {
  const firstReactorsByReaction = new Map<number, number>();

  for (const entry of entries) {
    if (!firstReactorsByReaction.has(entry.reactionId)) {
      firstReactorsByReaction.set(entry.reactionId, entry.userId);
    }
  }

  const ownedFirstReactionCount = Array.from(firstReactorsByReaction.values()).filter(
    (firstUserId) => firstUserId === userId,
  ).length;

  if (ownedFirstReactionCount >= 2) {
    throw new ConflictError(
      "You can only be the first reactor for two emojis on a post at a time.",
    );
  }
}

function assertFirstCommentReactorLimit(
  entries: Array<{ reactionId: number; userId: number }>,
  userId: number,
) {
  const firstReactorsByReaction = new Map<number, number>();

  for (const entry of entries) {
    if (!firstReactorsByReaction.has(entry.reactionId)) {
      firstReactorsByReaction.set(entry.reactionId, entry.userId);
    }
  }

  const ownedFirstReactionCount = Array.from(firstReactorsByReaction.values()).filter(
    (firstUserId) => firstUserId === userId,
  ).length;

  if (ownedFirstReactionCount >= 2) {
    throw new ConflictError(
      "You can only be the first reactor for two emojis on a comment at a time.",
    );
  }
}

async function findReactionByRef({
  reactionId,
  reactionSlug,
}: {
  reactionId?: number;
  reactionSlug?: string;
}) {
  const reaction = await db.reaction.findUnique({
    where: reactionId ? { id: reactionId } : { slug: String(reactionSlug) },
  });

  if (!reaction) {
    throw new NotFoundError("Reaction not found.");
  }

  return reaction;
}

export async function togglePostReaction({
  input,
  userId,
  tenantId,
}: {
  input: z.infer<typeof togglePostReactionSchema>;
  userId: number;
  tenantId?: string | null;
}) {
  const post = await db.post.findUnique({
    where: input.postId ? { id: input.postId } : { slug: input.postSlug },
  });

  if (!post || post.deletedAt || post.removedAt) {
    throw new NotFoundError("Post not found.");
  }

  await assertPostBelongsToTenant(post.id, tenantId);

  const reaction = await findReactionByRef(input);

  const updated = await db.$transaction(async (tx) => {
    const existing = await tx.postReaction.findUnique({
      where: {
        postId_reactionId_userId: {
          postId: post.id,
          reactionId: reaction.id,
          userId,
        },
      },
    });

    if (existing) {
      await tx.postReaction.delete({ where: { id: existing.id } });
    } else {
      const postReactions = await tx.postReaction.findMany({
        where: { postId: post.id },
        select: {
          id: true,
          reactionId: true,
          userId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      if (!postReactions.some((entry) => entry.reactionId === reaction.id)) {
        assertFirstReactorLimit(postReactions, userId);
      }

      await tx.postReaction.create({
        data: {
          postId: post.id,
          reactionId: reaction.id,
          userId,
        },
      });
    }

    return tx.postReaction.findMany({
      where: { postId: post.id },
      include: {
        reaction: true,
        user: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });

  return buildReactionSummary(updated, userId);
}

export async function toggleCommentReaction({
  input,
  userId,
  tenantId,
}: {
  input: z.infer<typeof toggleCommentReactionSchema>;
  userId: number;
  tenantId?: string | null;
}) {
  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
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

  if (!comment || comment.deletedAt || comment.removedAt) {
    throw new NotFoundError("Comment not found.");
  }

  await assertCommentTargetBelongsToTenant(comment, tenantId);

  const reaction = await findReactionByRef(input);

  const updated = await db.$transaction(async (tx) => {
    const existing = await tx.commentReaction.findUnique({
      where: {
        commentId_reactionId_userId: {
          commentId: comment.id,
          reactionId: reaction.id,
          userId,
        },
      },
    });

    if (existing) {
      await tx.commentReaction.delete({ where: { id: existing.id } });
    } else {
      const commentReactions = await tx.commentReaction.findMany({
        where: { commentId: comment.id },
        select: {
          id: true,
          reactionId: true,
          userId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      if (!commentReactions.some((entry) => entry.reactionId === reaction.id)) {
        assertFirstCommentReactorLimit(commentReactions, userId);
      }

      await tx.commentReaction.create({
        data: {
          commentId: comment.id,
          reactionId: reaction.id,
          userId,
        },
      });
    }

    return tx.commentReaction.findMany({
      where: { commentId: comment.id },
      include: {
        reaction: true,
        user: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });

  return buildReactionSummary(updated, userId);
}

