import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
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
    } = req.body;

    if (!content || !(postId || commentId || gameId)) {
      res.status(400);
      res.send();
      return;
    }

    let post;
    let game;

    if (postId) {
      post = await db.post.findUnique({
        where: {
          id: postId,
        },
      });

      if (!post) {
        res.status(401);
        res.send();
        return;
      }
    }

    if (commentId) {
      const comment = await db.comment.findUnique({
        where: {
          id: commentId,
        },
      });

      if (!comment) {
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

    const newcomment = await db.comment.create({
      data: {
        content,
        authorId: res.locals.user.id,
        postId: postId,
        commentId: commentId,
        gameId: gameId,
      },
    });

    if (post) {
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

    if (game) {
      game.team.users.forEach(async (member) => {
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

    res.send({ message: "Comment created" });
  }
);

export default router;
