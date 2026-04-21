import { Router } from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

const router = Router();

router.post("/", rateLimit(), authUser, getUser, async (req, res) => {
  const { postId, postSlug, reactionId, reactionSlug } = req.body;
  const userId = res.locals.user.id;

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

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.postReaction.findUnique({
        where: {
          postId_reactionId_userId: {
            postId: post.id,
            reactionId: reaction.id,
            userId,
          },
        },
      });

      if (existing) {
        await tx.postReaction.delete({ where: { id: existing.id } });
      } else {
        const postReactions = await tx.postReaction.findMany({
          where: { postId: post.id },
          select: {
            id: true,
            reactionId: true,
            userId: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

        const reactionAlreadyExists = postReactions.some(
          (entry) => entry.reactionId === reaction.id,
        );

        if (!reactionAlreadyExists) {
          const firstReactorsByReaction = new Map<number, number>();

          for (const entry of postReactions) {
            if (!firstReactorsByReaction.has(entry.reactionId)) {
              firstReactorsByReaction.set(entry.reactionId, entry.userId);
            }
          }

          const ownedFirstReactionCount = Array.from(
            firstReactorsByReaction.values(),
          ).filter((firstUserId) => firstUserId === userId).length;

          if (ownedFirstReactionCount >= 2) {
            return { limited: true as const, updated: [] };
          }
        }

        await tx.postReaction.create({
          data: {
            postId: post.id,
            reactionId: reaction.id,
            userId,
          },
        });
      }

      const updated = await tx.postReaction.findMany({
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

      return { limited: false as const, updated };
    });

    if (result.limited) {
      res.status(409).json({
        message:
          "You can only be the first reactor for two emojis on a post at a time.",
      });
      return;
    }

    const updated = result.updated;

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

    for (const entry of updated) {
      const current = summaryMap.get(entry.reactionId) ?? {
        reaction: entry.reaction,
        count: 0,
        reacted: false,
        firstReactionAt: null,
        firstReactorUserId: null,
        users: [],
      };
      current.count += 1;
      if (entry.userId === userId) {
        current.reacted = true;
      }
      if (
        !current.firstReactionAt ||
        entry.createdAt < current.firstReactionAt
      ) {
        current.firstReactionAt = entry.createdAt;
        current.firstReactorUserId = entry.userId;
      }
      if (entry.user) {
        current.users.push(entry.user);
      }
      summaryMap.set(entry.reactionId, current);
    }

    const reactions = Array.from(summaryMap.values())
      .map((summary) => ({
        reaction: summary.reaction,
        count: summary.count,
        reacted: summary.reacted,
        isFirstReactor: summary.firstReactorUserId === userId,
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
