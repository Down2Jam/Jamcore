import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import {
  notifyNewMentions,
  resolveCommentMentionContext,
} from "@helper/mentionNotifications";
import { UserType } from "types/UserType";

const router = Router();

/**
 * Route to create a comment.
 */
router.post(
  "/",
  rateLimit(),

  authUser,
  getUser,

  async (req, res) => {
    const {
      content,
      postId = null,
      commentId = null,
      gameId = null,
      trackId = null,
    } = req.body;

    if (!content || !(postId || commentId || gameId || trackId)) {
      res.status(400);
      res.send();
      return;
    }

    let post;
    let game;
    let track;
    let parentComment;

    if (postId) {
      post = await db.post.findUnique({
        where: {
          id: postId,
        },
      });

      if (!post || post.deletedAt || post.removedAt) {
        res.status(401);
        res.send();
        return;
      }
    }

    if (commentId) {
      parentComment = await db.comment.findUnique({
        where: {
          id: commentId,
        },
        include: {
          post: {
            select: {
              id: true,
              slug: true,
              title: true,
            },
          },
          game: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
          track: {
            select: {
              id: true,
              slug: true,
              name: true,
            },
          },
        },
      });

      if (
        !parentComment ||
        parentComment.deletedAt ||
        parentComment.removedAt
      ) {
        res.status(401);
        res.send();
        return;
      }
    }

    if (gameId) {
      game = await db.game.findUnique({
        where: {
          id: gameId,
        },
        include: {
          team: {
            include: {
              users: true,
            },
          },
        },
      });

      if (!game) {
        res.status(401);
        res.send();
        return;
      }
    }

    if (trackId) {
      track = await db.track.findUnique({
        where: {
          id: trackId,
        },
        include: {
          game: {
            include: {
              team: {
                include: {
                  users: true,
                },
              },
            },
          },
        },
      });

      if (!track) {
        res.status(401);
        res.send();
        return;
      }
    }

    const newcomment = await db.comment.create({
      data: {
        content,
        authorId: res.locals.user.id,
        postId: postId,
        commentId: commentId,
        gameId: gameId,
        trackId: trackId,
      },
    });

    if (post && post.authorId !== res.locals.user.id) {
      await db.notification.create({
        data: {
          type: "POST_COMMENT",
          recipientId: post.authorId,
          actorId: res.locals.user.id,
          postId: post.id,
          commentId: newcomment.id,
        },
      });
    }

    if (
      parentComment &&
      parentComment.authorId !== res.locals.user.id
    ) {
      await db.notification.create({
        data: {
          type: "COMMENT_REPLY",
          recipientId: parentComment.authorId,
          actorId: res.locals.user.id,
          postId: parentComment.postId,
          gameId: parentComment.gameId,
          commentId: newcomment.id,
        },
      });
    }

    if (game) {
      game.team.users.forEach(async (member) => {
        if (member.id === res.locals.user.id) return;
        await db.notification.create({
          data: {
            type: "GAME_COMMENT",
            recipientId: member.id,
            actorId: res.locals.user.id,
            gameId: game.id,
            commentId: newcomment.id,
          },
        });
      });
    }

    if (track) {
      track.game.team.users.forEach(async (member) => {
        if (member.id === res.locals.user.id) return;
        await db.notification.create({
          data: {
            type: "TRACK_COMMENT",
            recipientId: member.id,
            actorId: res.locals.user.id,
            trackId: track.id,
            commentId: newcomment.id,
          },
        });
      });
    }

    const resolvedContext =
      parentComment && !post && !game
        ? await resolveCommentMentionContext(parentComment.id)
        : {};

    await notifyNewMentions({
      type: "comment",
      actorId: res.locals.user.id,
      actorName: res.locals.user.name,
      actorSlug: res.locals.user.slug,
      beforeContent: "",
      afterContent: content,
      commentId: newcomment.id,
      postId: post?.id ?? parentComment?.post?.id ?? resolvedContext.postId,
      postSlug:
        post?.slug ?? parentComment?.post?.slug ?? resolvedContext.postSlug,
      postTitle:
        post?.title ?? parentComment?.post?.title ?? resolvedContext.postTitle,
      gameId: game?.id ?? parentComment?.game?.id ?? resolvedContext.gameId,
      gameSlug:
        game?.slug ?? parentComment?.game?.slug ?? resolvedContext.gameSlug,
      gameName:
        game?.name ?? parentComment?.game?.name ?? resolvedContext.gameName,
      trackId:
        track?.id ?? parentComment?.track?.id ?? resolvedContext.trackId,
      trackSlug:
        track?.slug ?? parentComment?.track?.slug ?? resolvedContext.trackSlug,
      trackName:
        track?.name ?? parentComment?.track?.name ?? resolvedContext.trackName,
    });

    res.send({ message: "Comment created" });
  }
);

export default router;
