import { Router } from "express";

import getTargetTeam from "@loaders/getTargetTeam";
import assertTargetTeamApplicationsOpen from "@guards/assertTargetTeamApplicationsOpen";
import assertUserHasNotAppliedForTargetTeam from "@guards/assertUserHasNotAppliedForTargetTeam";
import assertUserIsNotInTargetTeam from "@guards/assertUserIsNotInTargetTeam";
import { asyncHandler } from "@middleware/asyncHandler";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import {
  createTeamApplication,
  teamMessageSchema,
} from "@features/teams";
import {
  requireRequestUser,
  requireTargetTeam,
} from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  getTargetTeam,
  assertTargetTeamApplicationsOpen,
  assertUserHasNotAppliedForTargetTeam,
  assertUserIsNotInTargetTeam,
  asyncHandler(async (req, res) => {
    const { content } = parseBody(req, teamMessageSchema);
    const user = requireRequestUser(res);
    const targetTeam = requireTargetTeam(res);

    await createTeamApplication({
      actor: user,
      team: targetTeam,
      content,
    });

    res.send({ message: "Application created" });
  }),
);

export default router;

