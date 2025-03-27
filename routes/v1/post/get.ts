import { Router } from "express";
import db from "@helper/db";

const router = Router();

// TODO: clean

router.get("/", async function (req, res) {
  const { id, slug, user } = req.query;

  if ((!id || isNaN(parseInt(id as string))) && !slug) {
    res.status(400);
    res.send();
    return;
  }

  let userId = null;
  if (user) {
    const userRecord = await db.user.findUnique({
      where: { slug: String(user) },
    });
    userId = userRecord ? userRecord.id : null;
  }

  if (id) {
    let idnumber = parseInt(id as string);

    const post = await db.post.findUnique({
      where: {
        id: idnumber,
      },
      include: {
        likes: true,
      },
    });

    res.send({
      ...post,
      hasLiked: user && post?.likes.some((like) => like.userId === userId),
    });
  } else {
    const post = await db.post.findUnique({
      where: {
        slug: slug as string,
      },
      include: {
        author: true,
        tags: true,
        likes: true,
        comments: {
          include: {
            author: true,
            likes: true,
            children: {
              include: {
                author: true,
                likes: true,
                children: {
                  include: {
                    author: true,
                    likes: true,
                    children: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    function addHasLikedToComments(comments: any[]): any {
      return comments?.map((comment) => ({
        ...comment,
        hasLiked: user && comment.likes?.some((like) => like.userId === userId),
        children: comment.children
          ? addHasLikedToComments(comment.children)
          : [],
      }));
    }

    const commentsWithHasLiked = addHasLikedToComments(post?.comments);

    res.send({
      ...post,
      comments: commentsWithHasLiked,
      hasLiked: user && post?.likes.some((like) => like.userId === userId),
    });
  }
});

export default router;
