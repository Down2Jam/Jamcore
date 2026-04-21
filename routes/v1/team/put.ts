import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import getJam from "@middleware/getJam";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import getTargetTeam from "@middleware/getTargetTeam";
import assertUserModOrUserTargetTeamOwner from "@middleware/assertUserModOrUserTargetTeamOwner";

var router = express.Router();

router.put(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getTargetTeam,
  assertUserModOrUserTargetTeamOwner,

  async (req, res) => {
    const {
      applicationsOpen,
      rolesWanted,
      description,
      users,
      invitations,
      name,
    } = req.body;

    const team = await db.team.update({
      where: {
        id: res.locals.targetTeam.id,
      },
      data: {
        applicationsOpen,
        description: description ? description : null,
        name: name ? name : null,
      },
      select: {
        rolesWanted: { select: { slug: true } },
        users: true,
        invites: true,
      },
    });

    const currentRolesWanted = team.rolesWanted.map((role) => role.slug);

    const rolesWantedToDisconnect = currentRolesWanted.filter(
      (role) => !rolesWanted.includes(role)
    );

    const usersToDisconnect = team.users.filter(
      (user) => users.filter((user2) => user.id == user2.id).length == 0
    );

    const invitesToDisconnect = team.invites.filter(
      (user) => invitations.filter((user2) => user.id == user2.id).length == 0
    );

    await db.team.update({
      where: { id: res.locals.targetTeam.id },
      data: {
        rolesWanted: {
          disconnect: rolesWantedToDisconnect.map((slug) => ({
            slug,
          })),
          connect: rolesWanted.map((roleSlug: string) => ({
            slug: roleSlug,
          })),
        },
        users: {
          disconnect: usersToDisconnect.map((user) => ({
            id: user.id,
          })),
        },
      },
    });

    for (let invite of invitesToDisconnect) {
      await db.teamInvite.delete({
        where: {
          id: invite.id,
        },
      });
    }

    res.send({ message: "Team updated" });
  }
);

export default router;
