import { Router } from "express";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "@helper/contentModeration";
import db from "@helper/db";

const router = Router();

const buildReactionSummary = (
  reactions: Array<{
    reaction: any;
    userId: number;
    reactionId: number;
    createdAt?: Date;
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
      firstReactionAt: Date | null;
      firstReactorUserId: number | null;
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
      firstReactionAt: null,
      firstReactorUserId: null,
      users: [],
    };
    current.count += 1;
    if (userId && entry.userId === userId) {
      current.reacted = true;
    }
    if (
      !current.firstReactionAt ||
      (entry.createdAt && entry.createdAt < current.firstReactionAt)
    ) {
      current.firstReactionAt = entry.createdAt ?? null;
      current.firstReactorUserId = entry.userId;
    }
    if (entry.user) {
      current.users.push(entry.user);
    }
    summaryMap.set(entry.reactionId, current);
  }

  return Array.from(summaryMap.values())
    .map((summary) => ({
      reaction: summary.reaction,
      count: summary.count,
      reacted: summary.reacted,
      isFirstReactor:
        Boolean(userId) && summary.firstReactorUserId === userId,
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
  let privilegedViewer = false;
  if (user) {
    const userRecord = await db.user.findUnique({
      where: { slug: String(user) },
    });
    userId = userRecord ? userRecord.id : null;
    privilegedViewer = isPrivilegedViewer(userRecord);
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

    if ((post?.deletedAt || post?.removedAt) && !privilegedViewer) {
      res.status(404).send();
      return;
    }

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
            },
          },
        },
      },
    });

    if ((post?.deletedAt || post?.removedAt) && !privilegedViewer) {
      res.status(404).send();
      return;
    }
    const commentsWithHasLiked = mapCommentsForViewer(
      post?.comments,
      userId,
      privilegedViewer
    );
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
