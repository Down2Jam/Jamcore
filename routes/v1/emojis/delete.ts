import { Router } from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

const router = Router();

router.delete(
  "/:id",
  rateLimit(),
  authUser,
  getUser,
  async (req, res) => {
    const { id } = req.params;
    const reactionId = Number(id);
    if (!reactionId) {
      res.status(400).json({ message: "Emoji id is required." });
      return;
    }

    try {
      const existing = await db.reaction.findUnique({
        where: { id: reactionId },
        select: { id: true, scopeType: true, scopeUserId: true, scopeGameId: true },
      });
      if (!existing) {
        res.status(404).json({ message: "Emoji not found." });
        return;
      }

      const isAdmin = Boolean(res.locals.user?.admin);
      let isOwner = false;

      if (existing.scopeType === "USER" && existing.scopeUserId) {
        isOwner = existing.scopeUserId === res.locals.user?.id;
      }

      if (existing.scopeType === "GAME" && existing.scopeGameId) {
        const game = await db.game.findUnique({
          where: { id: existing.scopeGameId },
          include: { team: { include: { users: true } } },
        });
        if (game) {
          isOwner = game.team.users.some((user) => user.id === res.locals.user?.id);
        }
      }

      if (!isAdmin) {
        if (existing.scopeType === "GLOBAL" || !isOwner) {
          res.status(403).json({ message: "Not allowed to delete this emoji." });
          return;
        }
      }

      await db.postReaction.deleteMany({ where: { reactionId } });
      await db.reaction.delete({ where: { id: reactionId } });

      res.json({ message: "Emoji deleted" });
    } catch (error) {
      console.error("Failed to delete emoji", error);
      res.status(500).json({ message: "Failed to delete emoji" });
    }
  }
);

export default router;
