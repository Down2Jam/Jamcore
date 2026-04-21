import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

const router = Router();

/**
 * Route to delete an application
 */
router.delete(
  "/",
  rateLimit(),

  authUser,
  getUser,

  async (req, res) => {
    const { accept, inviteId } = req.body;

    const invite = await db.teamApplication.findUnique({
      where: {
        id: inviteId,
      },
      include: {
        team: {
          include: {
            game: true,
          },
        },
      },
    });

    if (!invite) {
      res.status(401).send({ message: "Invalid application" });
      return;
    }

    if (accept) {
      if (invite.team.game && invite.team.game.category == "ODA") {
        res.status(401).send({ message: "Your team is a part of O.D.A" });
        return;
      }

      await db.team.update({
        where: { id: invite.teamId },
        data: {
          users: {
            connect: {
              id: invite.userId,
            },
          },
        },
      });
    }

    await db.teamApplication.delete({
      where: {
        id: inviteId,
      },
    });

    res.send({ message: "Application accepted" });
  }
);

export default router;
