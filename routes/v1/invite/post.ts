import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import getTargetTeam from "@middleware/getTargetTeam";
import assertUserTargetTeamOwner from "@middleware/assertUserModOrUserTargetTeamOwner";
import getTargetUser from "@middleware/getTargetUser";
import assertTargetTeamHasNotInvitedTargetUser from "@middleware/assertTargetTeamHasNotInvitedTargetUser";
import assertTargetUserIsNotInTargetTeam from "@middleware/assertTargetUserIsNotInTargetTeam";

const router = Router();

/**
 * Route to create an invite to a team.
 */
router.post(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getTargetTeam,
  assertUserTargetTeamOwner,
  getTargetUser,
  assertTargetTeamHasNotInvitedTargetUser,
  assertTargetUserIsNotInTargetTeam,

  async (req, res) => {
    const { content } = req.body;

    if (
      res.locals.targetTeam.game &&
      res.locals.targetTeam.game.category == "ODA"
    ) {
      res.status(401).send({ message: "Your team is a part of O.D.A" });
      return;
    }

    const invite = await db.teamInvite.create({
      data: {
        userId: res.locals.targetUser.id,
        teamId: res.locals.targetTeam.id,
        content: content ? content : null,
      },
      include: {
        user: true,
      },
    });

    await db.notification.create({
      data: {
        teamInviteId: invite.id,
        recipientId: res.locals.targetUser.id,
        actorId: res.locals.user.id,
        type: "TEAM_INVITE",
      },
    });

    res.send({ message: "Invite created", data: invite });
  }
);

export default router;
