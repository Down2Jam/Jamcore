import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import db from "@helper/db";
import {
  notifyNewMentions,
  resolveCommentMentionContext,
} from "@helper/mentionNotifications";

const router = Router();

router.put("/", rateLimit(), authUser, getUser, async (req, res) => {
  const { commentId, content } = req.body;
  const id = Number(commentId);

  if (!id || Number.isNaN(id) || typeof content !== "string" || !content.trim()) {
    return res.status(400).send({ message: "Invalid comment update." });
  }

  const comment = await db.comment.findUnique({
    where: { id },
  });

  if (!comment) {
    return res.status(404).send({ message: "Comment not found." });
  }

  if (comment.deletedAt || comment.removedAt) {
    return res.status(400).send({ message: "Cannot edit a deleted or removed comment." });
  }

  const isAuthor = comment.authorId === res.locals.user.id;
  const isModerator = Boolean(res.locals.user.mod);
  if (!isAuthor && !isModerator) {
    return res.status(403).send({ message: "Not allowed." });
  }

  const updated = await db.comment.update({
    where: { id },
    data: {
      content,
      editedAt: new Date(),
    },
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
  });

  const resolvedContext = await resolveCommentMentionContext(comment.id);

  await notifyNewMentions({
    type: "comment",
    actorId: res.locals.user.id,
    actorName: res.locals.user.name,
    actorSlug: res.locals.user.slug,
    beforeContent: comment.content,
    afterContent: content,
    commentId: updated.id,
    postId: resolvedContext.postId,
    postSlug: resolvedContext.postSlug,
    postTitle: resolvedContext.postTitle,
    gameId: resolvedContext.gameId,
    gameSlug: resolvedContext.gameSlug,
    gameName: resolvedContext.gameName,
    trackId: resolvedContext.trackId,
    trackSlug: resolvedContext.trackSlug,
    trackName: resolvedContext.trackName,
  });

  return res.send({ message: "Comment updated", data: updated });
});

export default router;
