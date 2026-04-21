import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

const router = Router();

/**
 * Route to delete an invite
 */
router.delete(
  "/",
  rateLimit(),

  authUser,
  getUser,

  async (req, res) => {
    const { accept, inviteId } = req.body;

    const invite = await db.teamInvite.findUnique({
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
      res.status(401).send({ message: "Invalid invite" });
      return;
    }

    if (accept) {
      if (invite.team.game && invite.team.game.category == "ODA") {
        res.status(401).send({ message: "That team is a part of O.D.A" });
        return;
      }

      await db.team.update({
        where: { id: invite.teamId },
        data: {
          users: {
            connect: {
              id: res.locals.user.id,
            },
          },
        },
      });
    }

    await db.teamInvite.delete({
      where: {
        id: inviteId,
      },
    });

    res.send({ message: "Invite accepted" });
  }
);

export default router;
