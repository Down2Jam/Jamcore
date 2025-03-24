import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

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

    if (postId) {
      const post = await db.post.findUnique({
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
      const game = await db.game.findUnique({
        where: {
          id: gameId,
        },
      });

      if (!game) {
        res.status(401);
        res.send();
        return;
      }
    }

    await db.comment.create({
      data: {
        content,
        authorId: res.locals.user.id,
        postId: postId,
        commentId: commentId,
        gameId: gameId,
      },
    });

    res.send({ message: "Comment created" });
  }
);

export default router;
