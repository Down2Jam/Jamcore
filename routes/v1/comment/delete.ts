import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import db from "@helper/db";
import { cleanupNotificationsForComment } from "@helper/contentModeration";

const router = Router();

router.delete("/", rateLimit(), authUser, getUser, async (req, res) => {
  const { commentId, mode } = req.body;
  const id = Number(commentId);

  if (!id || Number.isNaN(id)) {
    return res.status(400).send({ message: "Invalid comment id." });
  }

  const comment = await db.comment.findUnique({
    where: { id },
  });

  if (!comment) {
    return res.status(404).send({ message: "Comment not found." });
  }

  const isAuthor = comment.authorId === res.locals.user.id;
  const isModerator = Boolean(res.locals.user.mod || res.locals.user.admin);
  const isRemoval = mode === "remove";

  if (!isAuthor && !isModerator) {
    return res.status(403).send({ message: "Not allowed." });
  }

  if (isRemoval && !isModerator) {
    return res.status(403).send({ message: "Not allowed." });
  }

  await cleanupNotificationsForComment(id);

  await db.comment.update({
    where: { id },
    data: {
      deletedAt: !isRemoval ? new Date() : comment.deletedAt,
      removedAt: isRemoval ? new Date() : comment.removedAt,
    },
  });

  return res.send({ message: isRemoval ? "Comment removed" : "Comment deleted" });
});

export default router;
