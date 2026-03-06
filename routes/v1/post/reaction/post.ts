import { Router } from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

const router = Router();

router.post("/", rateLimit(), authUser, getUser, async (req, res) => {
  const { postId, postSlug, reactionId, reactionSlug } = req.body;

  if (!postId && !postSlug) {
    res.status(400).json({ message: "Post id or slug is required." });
    return;
  }

  if (!reactionId && !reactionSlug) {
    res.status(400).json({ message: "Reaction id or slug is required." });
    return;
  }

  try {
    const post = await db.post.findUnique({
      where: postId ? { id: Number(postId) } : { slug: String(postSlug) },
    });

    if (!post) {
      res.status(404).json({ message: "Post not found." });
      return;
    }

    const reaction = await db.reaction.findUnique({
      where: reactionId
        ? { id: Number(reactionId) }
        : { slug: String(reactionSlug) },
    });

    if (!reaction) {
      res.status(404).json({ message: "Reaction not found." });
      return;
    }

    const existing = await db.postReaction.findUnique({
      where: {
        postId_reactionId_userId: {
          postId: post.id,
          reactionId: reaction.id,
          userId: res.locals.user.id,
        },
      },
    });

    if (existing) {
      await db.postReaction.delete({ where: { id: existing.id } });
    } else {
      await db.postReaction.create({
        data: {
          postId: post.id,
          reactionId: reaction.id,
          userId: res.locals.user.id,
        },
      });
    }

    const updated = await db.postReaction.findMany({
      where: { postId: post.id },
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
    });

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

    for (const entry of updated) {
      const current = summaryMap.get(entry.reactionId) ?? {
        reaction: entry.reaction,
        count: 0,
        reacted: false,
        users: [],
      };
      current.count += 1;
      if (entry.userId === res.locals.user.id) {
        current.reacted = true;
      }
      if (entry.user) {
        current.users.push(entry.user);
      }
      summaryMap.set(entry.reactionId, current);
    }

    const reactions = Array.from(summaryMap.values())
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

    res.json({ message: "Reaction updated", data: reactions });
  } catch (error) {
    console.error("Failed to update reaction", error);
    res.status(500).json({ message: "Failed to update reaction" });
  }
});

export default router;
