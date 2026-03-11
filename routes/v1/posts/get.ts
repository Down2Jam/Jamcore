import express from "express";
import { PostTime } from "../../../types/PostTimes";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "@helper/contentModeration";
import db from "@helper/db";

var router = express.Router();

type WhereType = {
  createdAt?: {};
  tags?: {};
  sticky?: boolean;
  deletedAt?: null;
  removedAt?: null;
};

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

router.get(
  "/",

  async function (req, res) {
    const {
      sort = "newest",
      time = "all",
      user,
      tags,
      sticky = false,
    } = req.query;

    let orderBy = {};
    let where: WhereType = {};
    const now = new Date();

    if (time !== "all") {
      const timeMapping: Record<PostTime, number> = {
        hour: 1,
        three_hours: 3,
        six_hours: 6,
        twelve_hours: 12,
        day: 24,
        week: 7 * 24,
        month: 30 * 24,
        three_months: 3 * 30 * 24,
        six_months: 6 * 30 * 24,
        nine_months: 9 * 30 * 24,
        year: 365 * 24,
        all: 0,
      };

      const hours = timeMapping[time as PostTime] || 0;
      where["createdAt"] = {
        gte: new Date(now.getTime() - hours * 60 * 60 * 1000),
      };
    }

    if (tags) {
      const splitTags = (tags as string).split("_");
      const splitSplitTags = splitTags.map((tag) => ({
        id: tag.split(",")[0],
        value: tag.split(",")[1],
      }));

      const includeTags = splitSplitTags
        .filter((tag) => tag.value === "1")
        .map((tag) => parseInt(tag.id));

      const excludeTags = splitSplitTags
        .filter((tag) => tag.value === "-1")
        .map((tag) => parseInt(tag.id));

      if (includeTags.length > 0) {
        where["tags"] = {
          some: { id: { in: includeTags } },
        };
      }

      console.log(includeTags);

      if (excludeTags.length > 0) {
        where["tags"] = {
          ...where["tags"],
          none: { id: { in: excludeTags } },
        };
      }

      console.log(excludeTags);
    }

    // Handle sort filters
    if (sort === "oldest") {
      orderBy = { id: "asc" };
    } else if (sort === "newest") {
      orderBy = { id: "desc" };
    } else if (sort === "top") {
      orderBy = { likes: { _count: "desc" } };
    }

    if (sticky === "true") {
      where.sticky = true;
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

    if (!privilegedViewer) {
      where.deletedAt = null;
      where.removedAt = null;
    }

    const posts = await db.post.findMany({
      take: 20,
      where,
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
      orderBy,
    });

    const postsWithLikes = posts.map((post) => ({
      ...post,
      hasLiked: userId
        ? post.likes.some((like) => like.userId === userId)
        : false,
      reactions: buildReactionSummary(post.postReactions, userId),
      comments: mapCommentsForViewer(post.comments, userId, privilegedViewer),
    }));

    console.log(postsWithLikes[0]?.comments);

    res.send(postsWithLikes);
  }
);

export default router;
