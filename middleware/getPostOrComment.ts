import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getPostOrComment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { postId, commentId } = req.body;

  if (!postId && !commentId) {
    res.status(502).send("Post or comment id missing.");
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

    if (!post) {
      res.status(404).send({ message: "Post missing." });
      return;
    }

    res.locals.post = post;
  } else {
    const comment = await db.comment.findUnique({
      where: {
        id: commentId,
      },
      include: {
        likes: true,
      },
    });

    if (!comment) {
      res.status(404).send({ message: "Comment missing." });
      return;
    }

    res.locals.comment = comment;
  }

  next();
}

export default getPostOrComment;
