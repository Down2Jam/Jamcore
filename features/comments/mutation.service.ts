import { PageVersion } from "@prisma/client";
import { z } from "zod";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { assertCommentTargetBelongsToTenant } from "../../lib/contentTenant.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import {
  notifyNewMentions,
  resolveCommentMentionContext,
} from "../mentions/notifications.service.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../lib/errors.js";
import {
  publishCommentCreated,
  publishCommentUpdated,
} from "../federation/index.js";

const commentTargetSchema = z
  .object({
    postId: z.coerce.number().int().positive().nullable().optional(),
    commentId: z.coerce.number().int().positive().nullable().optional(),
    gameId: z.coerce.number().int().positive().nullable().optional(),
    gamePageId: z.coerce.number().int().positive().nullable().optional(),
    trackId: z.coerce.number().int().positive().nullable().optional(),
  })
  .refine(
    (payload) =>
      [payload.postId, payload.commentId, payload.gameId, payload.gamePageId, payload.trackId]
        .filter((value) => value != null).length === 1,
    {
      message:
        "Comment must target exactly one post, comment, game, game page, or track.",
    },
  );

export const createCommentSchema = commentTargetSchema.extend({
  content: z.string().trim().min(1),
});

export const updateCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1),
});

type CommentActor = {
  id: number;
  name: string;
  slug: string;
  mod?: boolean | null;
};

async function assertCoreTenant({
  entityType,
  entityId,
  tenantId,
  notFoundMessage,
}: {
  entityType: "Post" | "Game";
  entityId: number;
  tenantId?: string | null;
  notFoundMessage: string;
}) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType,
    entityId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new BadRequestError(notFoundMessage);
  }
}

async function loadCommentPost(
  postId: number | null | undefined,
  tenantId?: string | null,
) {
  if (!postId) {
    return null;
  }

  const post = await db.post.findUnique({
    where: {
      id: postId,
    },
  });

  if (!post || post.deletedAt || post.removedAt) {
    throw new BadRequestError("Post not found or unavailable.");
  }

  await assertCoreTenant({
    entityType: "Post",
    entityId: post.id,
    tenantId,
    notFoundMessage: "Post not found or unavailable.",
  });

  return post;
}

async function loadParentComment(
  commentId: number | null | undefined,
  tenantId?: string | null,
) {
  if (!commentId) {
    return null;
  }

  const comment = await db.comment.findUnique({
    where: {
      id: commentId,
    },
    include: {
      post: {
        select: {
          id: true,
          slug: true,
          title: true,
          deletedAt: true,
          removedAt: true,
        },
      },
      game: {
        select: {
          id: true,
          slug: true,
          pages: {
            where: { version: PageVersion.JAM },
            select: { name: true },
            take: 1,
          },
        },
      },
      gamePage: {
        select: {
          id: true,
          version: true,
          name: true,
          game: {
            select: {
              id: true,
              slug: true,
              pages: {
                where: { version: PageVersion.JAM },
                select: { name: true },
                take: 1,
              },
            },
          },
        },
      },
      track: {
        select: {
          id: true,
          slug: true,
          name: true,
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
    throw new BadRequestError("Parent comment not found or unavailable.");
  }

  if (comment.post) {
    if (comment.post.deletedAt || comment.post.removedAt) {
      throw new BadRequestError("Parent comment not found or unavailable.");
    }
    await assertCoreTenant({
      entityType: "Post",
      entityId: comment.post.id,
      tenantId,
      notFoundMessage: "Parent comment not found or unavailable.",
    });
  } else {
    const gameId =
      comment.game?.id ??
      comment.gamePage?.game?.id ??
      comment.track?.gamePage?.game?.id ??
      null;
    if (gameId) {
      await assertCoreTenant({
        entityType: "Game",
        entityId: gameId,
        tenantId,
        notFoundMessage: "Parent comment not found or unavailable.",
      });
    }
  }

  return comment;
}

async function loadCommentGame(
  gameId: number | null | undefined,
  tenantId?: string | null,
) {
  if (!gameId) {
    return null;
  }

  const game = await db.game.findUnique({
    where: {
      id: gameId,
    },
    include: {
      pages: {
        where: { version: PageVersion.JAM },
        select: { name: true },
        take: 1,
      },
      team: {
        include: {
          users: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!game) {
    throw new BadRequestError("Game not found.");
  }

  await assertCoreTenant({
    entityType: "Game",
    entityId: game.id,
    tenantId,
    notFoundMessage: "Game not found.",
  });

  return game;
}

async function loadCommentGamePage(
  gamePageId: number | null | undefined,
  tenantId?: string | null,
) {
  if (!gamePageId) {
    return null;
  }

  const gamePage = await db.gamePage.findUnique({
    where: {
      id: gamePageId,
    },
    include: {
      game: {
        include: {
          pages: {
            where: { version: PageVersion.JAM },
            select: { name: true },
            take: 1,
          },
          team: {
            include: {
              users: {
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

  if (!gamePage) {
    throw new BadRequestError("Game page not found.");
  }

  await assertCoreTenant({
    entityType: "Game",
    entityId: gamePage.game.id,
    tenantId,
    notFoundMessage: "Game page not found.",
  });

  return gamePage;
}

async function loadCommentTrack(
  trackId: number | null | undefined,
  tenantId?: string | null,
) {
  if (!trackId) {
    return null;
  }

  const track = await db.gamePageTrack.findUnique({
    where: {
      id: trackId,
    },
    include: {
      gamePage: {
        include: {
          game: {
            include: {
              team: {
                include: {
                  users: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!track) {
    throw new BadRequestError("Track not found.");
  }

  await assertCoreTenant({
    entityType: "Game",
    entityId: track.gamePage.game.id,
    tenantId,
    notFoundMessage: "Track not found.",
  });

  return track;
}

async function createTeamCommentNotifications({
  recipientIds,
  actorId,
  commentId,
  type,
  gameId,
  trackId,
}: {
  recipientIds: number[];
  actorId: number;
  commentId: number;
  type: "GAME_COMMENT" | "TRACK_COMMENT";
  gameId?: number;
  trackId?: number;
}) {
  const filteredRecipientIds = recipientIds.filter(
    (recipientId) => recipientId !== actorId,
  );
  if (filteredRecipientIds.length === 0) {
    return;
  }

  await Promise.all(
    filteredRecipientIds.map((recipientId) =>
      db.notification.create({
        data: {
          type,
          recipientId,
          actorId,
          ...(gameId ? { gameId } : {}),
          ...(trackId ? { trackId } : {}),
          commentId,
        },
      }),
    ),
  );
}

export async function createComment({
  actor,
  input,
  tenantId,
}: {
  actor: CommentActor | null | undefined;
  input: z.infer<typeof createCommentSchema>;
  tenantId?: string | null;
}) {
  if (!actor) {
    throw new UnauthorizedError("User missing");
  }

  const { content, postId, commentId, gameId, gamePageId, trackId } = input;

  const [post, parentComment, game, gamePage, track] = await Promise.all([
    loadCommentPost(postId, tenantId),
    loadParentComment(commentId, tenantId),
    loadCommentGame(gameId, tenantId),
    loadCommentGamePage(gamePageId, tenantId),
    loadCommentTrack(trackId, tenantId),
  ]);

  const newComment = await db.comment.create({
    data: {
      content,
      authorId: actor.id,
      postId: postId ?? null,
      commentId: commentId ?? null,
      gameId: gameId ?? null,
      gamePageId: gamePageId ?? null,
      trackId: trackId ?? null,
    },
  });

  if (post && post.authorId !== actor.id) {
    await db.notification.create({
      data: {
        type: "POST_COMMENT",
        recipientId: post.authorId,
        actorId: actor.id,
        postId: post.id,
        commentId: newComment.id,
      },
    });
  }

  const resolvedContext =
    parentComment && !post && !game && !gamePage && !track
      ? await resolveCommentMentionContext(parentComment.id)
      : {};

  if (parentComment && parentComment.authorId !== actor.id) {
    await db.notification.create({
      data: {
        type: "COMMENT_REPLY",
        recipientId: parentComment.authorId,
        actorId: actor.id,
        postId: parentComment.postId ?? resolvedContext.postId ?? null,
        gameId:
          parentComment.gameId ??
          parentComment.gamePage?.game?.id ??
          resolvedContext.gameId ??
          null,
        trackId: parentComment.trackId ?? resolvedContext.trackId ?? null,
        commentId: newComment.id,
      },
    });
  }

  await Promise.all([
    game
      ? createTeamCommentNotifications({
          recipientIds: game.team.users.map((member) => member.id),
          actorId: actor.id,
          gameId: game.id,
          commentId: newComment.id,
          type: "GAME_COMMENT",
        })
      : Promise.resolve(),
    gamePage
      ? createTeamCommentNotifications({
          recipientIds: gamePage.game.team.users.map((member) => member.id),
          actorId: actor.id,
          gameId: gamePage.game.id,
          commentId: newComment.id,
          type: "GAME_COMMENT",
        })
      : Promise.resolve(),
    track
      ? createTeamCommentNotifications({
          recipientIds: track.gamePage.game.team.users.map((member) => member.id),
          actorId: actor.id,
          trackId: track.id,
          commentId: newComment.id,
          type: "TRACK_COMMENT",
        })
      : Promise.resolve(),
  ]);

  await notifyNewMentions({
    type: "comment",
    actorId: actor.id,
    actorName: actor.name,
    actorSlug: actor.slug,
    beforeContent: "",
    afterContent: content,
    commentId: newComment.id,
    postId: post?.id ?? parentComment?.post?.id ?? resolvedContext.postId,
    postSlug:
      post?.slug ?? parentComment?.post?.slug ?? resolvedContext.postSlug,
    postTitle:
      post?.title ?? parentComment?.post?.title ?? resolvedContext.postTitle,
    gameId:
      game?.id ??
      gamePage?.game?.id ??
      parentComment?.game?.id ??
      parentComment?.gamePage?.game?.id ??
      resolvedContext.gameId,
    gameSlug:
      game?.slug ??
      gamePage?.game?.slug ??
      parentComment?.game?.slug ??
      parentComment?.gamePage?.game?.slug ??
      resolvedContext.gameSlug,
    gameName:
      game?.pages?.[0]?.name ??
      gamePage?.name ??
      gamePage?.game?.pages?.[0]?.name ??
      parentComment?.game?.pages?.[0]?.name ??
      parentComment?.gamePage?.game?.pages?.[0]?.name ??
      resolvedContext.gameName,
    trackId: track?.id ?? parentComment?.track?.id ?? resolvedContext.trackId,
    trackSlug:
      track?.slug ?? parentComment?.track?.slug ?? resolvedContext.trackSlug,
    trackName:
      track?.name ?? parentComment?.track?.name ?? resolvedContext.trackName,
  });

  await publishCommentCreated(newComment.id);

  return newComment;
}

export async function updateComment({
  actor,
  input,
  tenantId,
}: {
  actor: CommentActor | null | undefined;
  input: z.infer<typeof updateCommentSchema>;
  tenantId?: string | null;
}) {
  if (!actor) {
    throw new UnauthorizedError("User missing");
  }

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

  if (!comment) {
    throw new NotFoundError("Comment not found.");
  }

  if (comment.deletedAt || comment.removedAt) {
    throw new BadRequestError("Cannot edit a deleted or removed comment.");
  }

  await assertCommentTargetBelongsToTenant(comment, tenantId);

  const isAuthor = comment.authorId === actor.id;
  const isModerator = Boolean(actor.mod);
  if (!isAuthor && !isModerator) {
    throw new ForbiddenError("Not allowed.");
  }

  const updated = await db.comment.update({
    where: { id: input.commentId },
    data: {
      content: input.content,
      editedAt: new Date(),
    },
    include: {
      author: true,
      likes: true,
      commentReactions: {
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
      },
      children: {
        include: {
          author: true,
          likes: true,
          commentReactions: {
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
          },
          children: true,
        },
      },
    },
  });

  const resolvedContext = await resolveCommentMentionContext(comment.id);

  await notifyNewMentions({
    type: "comment",
    actorId: actor.id,
    actorName: actor.name,
    actorSlug: actor.slug,
    beforeContent: comment.content,
    afterContent: input.content,
    commentId: updated.id,
    postId: resolvedContext.postId,
    postSlug: resolvedContext.postSlug,
    postTitle: resolvedContext.postTitle,
    gameId: resolvedContext.gameId,
    gameSlug: resolvedContext.gameSlug,
    gameName: resolvedContext.gameName,
    trackId: resolvedContext.trackId,
    trackSlug: resolvedContext.trackSlug,
    trackName: resolvedContext.trackName,
  });

  await publishCommentUpdated(updated.id);

  return updated;
}

