import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  resolveTeamInvite,
  teamDecisionSchema,
} from "@features/teams";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.delete(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { accept, inviteId } = parseBody(req, teamDecisionSchema);
    const user = requireRequestUser(res);

    await resolveTeamInvite({
      inviteId,
      accept,
      actorUserId: user.id,
    });

    res.send({ message: "Invite accepted" });
  }),
);

export default router;

