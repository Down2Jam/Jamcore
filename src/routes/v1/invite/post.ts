import { Router } from "express";

import assertTargetTeamHasNotInvitedTargetUser from "@guards/assertTargetTeamHasNotInvitedTargetUser";
import assertTargetUserIsNotInTargetTeam from "@guards/assertTargetUserIsNotInTargetTeam";
import getTargetTeam from "@loaders/getTargetTeam";
import getTargetUser from "@loaders/getTargetUser";
import assertUserTargetTeamOwner from "@guards/assertUserModOrUserTargetTeamOwner";
import { asyncHandler } from "@middleware/asyncHandler";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import {
  createTeamInvite,
  teamMessageSchema,
} from "@features/teams";
import {
  requireRequestUser,
  requireTargetTeam,
  requireTargetUser,
} from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = Router();

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
  asyncHandler(async (req, res) => {
    const { content } = parseBody(req, teamMessageSchema);
    const user = requireRequestUser(res);
    const targetTeam = requireTargetTeam(res);
    const targetUser = requireTargetUser(res);

    const invite = await createTeamInvite({
      actor: user,
      team: targetTeam,
      targetUser,
      content,
    });

    res.send({ message: "Invite created", data: invite });
  }),
);

export default router;

