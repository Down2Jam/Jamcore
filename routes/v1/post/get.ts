import { Router } from "express";
import db from "@helper/db";

const router = Router();

const buildReactionSummary = (
  reactions: Array<{
    reaction: any;
    userId: number;
    reactionId: number;
    user?: { id: number; slug: string; name: string; profilePicture?: string | null };
  }>,
  userId: number | null
) => {
  const summaryMap = new Map<
    number,
    {
      reaction: any;
      count: number;
      reacted: boolean;
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
      users: [],
    };
    current.count += 1;
    if (userId && entry.userId === userId) {
      current.reacted = true;
    }
    if (entry.user) {
      current.users.push(entry.user);
    }
    summaryMap.set(entry.reactionId, current);
  }

  return Array.from(summaryMap.values())
    .map((summary) => ({
      ...summary,
      users: summary.users
        .filter(
          (user, index, self) =>
            self.findIndex((u) => u.id === user.id) === index
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.reaction.slug.localeCompare(b.reaction.slug);
  });
};

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
        postReactions: {
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
      },
    });

    const reactionSummary = buildReactionSummary(post?.postReactions ?? [], userId);

    res.send({
      ...post,
      hasLiked: user && post?.likes.some((like) => like.userId === userId),
      reactions: reactionSummary,
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
        postReactions: {
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
    const reactionSummary = buildReactionSummary(post?.postReactions ?? [], userId);

    res.send({
      ...post,
      comments: commentsWithHasLiked,
      hasLiked: user && post?.likes.some((like) => like.userId === userId),
      reactions: reactionSummary,
    });
  }
});

export default router;
