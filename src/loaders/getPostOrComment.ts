import { Request, Response, NextFunction } from "express";

import db from "../infra/db.js";
import {
  assertCommentTargetBelongsToTenant,
  assertPostBelongsToTenant,
} from "../lib/contentTenant.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

async function getPostOrComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const postId = Number(req.body?.postId ?? req.params?.postId ?? req.query?.postId);
  const commentId = Number(
    req.body?.commentId ?? req.params?.commentId ?? req.query?.commentId,
  );

  if (!postId && !commentId) {
    next(new BadRequestError("Post or comment id missing."));
    return;
  }

  if (postId) {
    const post = await db.post.findUnique({
      where: {
        id: postId,
      },
      include: {
        likes: true,
      },
    });

    if (!post || post.deletedAt || post.removedAt) {
      next(new NotFoundError("Post missing."));
      return;
    }

    await assertPostBelongsToTenant(post.id, res.locals.tenantId);
    res.locals.post = post;
  } else {
    const comment = await db.comment.findUnique({
      where: {
        id: commentId,
      },
      include: {
        likes: true,
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
      next(new NotFoundError("Comment missing."));
      return;
    }

    await assertCommentTargetBelongsToTenant(comment, res.locals.tenantId);
    res.locals.comment = comment;
  }

  next();
}

export default getPostOrComment;
