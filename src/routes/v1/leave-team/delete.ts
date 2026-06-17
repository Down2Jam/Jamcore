import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import getTargetTeam from "@loaders/getTargetTeam";
import rateLimit from "@middleware/rateLimit";
import assertUserNotTargetTeamOwner from "@guards/assertUserNotTargetTeamOwner";
import assertUserIsInTargetTeam from "@guards/assertUserIsInTargetTeam";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { leaveTeamById } from "@features/teams";
import { requireRequestUser, requireTargetTeam } from "@lib/locals";

const router = express.Router();

router.delete(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getTargetTeam,
  assertUserIsInTargetTeam,
  assertUserNotTargetTeamOwner,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    const targetTeam = requireTargetTeam(res);
    await leaveTeamById({
      teamId: targetTeam.id,
      userId: user.id,
    });

    res.status(200).send({ message: "Left team" });
  }),
);

export default router;

