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
      gamePageId = null,
      trackId = null,
    } = req.body;

    if (!content || !(postId || commentId || gameId || gamePageId || trackId)) {
      res.status(400);
      res.send();
      return;
    }

    let post;
    let game;
    let gamePage;
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
              pages: {
                where: { version: "JAM" },
                select: { name: true },
                take: 1,
              },
            },
          },
          gamePage: {
            select: {
              id: true,
              version: true,
              game: {
                select: {
                  id: true,
                  slug: true,
                  pages: {
                    where: { version: "JAM" },
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
          pages: {
            where: { version: "JAM" },
            select: { name: true },
            take: 1,
          },
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

    if (gamePageId) {
      gamePage = await db.gamePage.findUnique({
        where: {
          id: gamePageId,
        },
        include: {
          game: {
            include: {
              pages: {
                where: { version: "JAM" },
                select: { name: true },
                take: 1,
              },
              team: {
                include: {
                  users: true,
                },
              },
            },
          },
        },
      });

      if (!gamePage) {
        res.status(401);
        res.send();
        return;
      }
    }

    if (trackId) {
      track = await db.gamePageTrack.findUnique({
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
                      users: true,
                    },
                  },
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
        gamePageId: gamePageId,
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

    const resolvedContext =
      parentComment && !post && !game && !gamePage && !track
        ? await resolveCommentMentionContext(parentComment.id)
        : {};

    if (
      parentComment &&
      parentComment.authorId !== res.locals.user.id
    ) {
      await db.notification.create({
        data: {
          type: "COMMENT_REPLY",
          recipientId: parentComment.authorId,
          actorId: res.locals.user.id,
          postId: parentComment.postId ?? resolvedContext.postId ?? null,
          gameId:
            parentComment.gameId ??
            parentComment.gamePage?.game?.id ??
            resolvedContext.gameId ??
            null,
          trackId: parentComment.trackId ?? resolvedContext.trackId ?? null,
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

    if (gamePage) {
      gamePage.game.team.users.forEach(async (member) => {
        if (member.id === res.locals.user.id) return;
        await db.notification.create({
          data: {
            type: "GAME_COMMENT",
            recipientId: member.id,
            actorId: res.locals.user.id,
            gameId: gamePage.game.id,
            commentId: newcomment.id,
          },
        });
      });
    }

    if (track) {
      track.gamePage.game.team.users.forEach(async (member) => {
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
