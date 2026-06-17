import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  resolveTeamApplication,
  teamDecisionSchema,
} from "@features/teams";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.delete(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { accept, inviteId } = parseBody(req, teamDecisionSchema);

    await resolveTeamApplication({
      applicationId: inviteId,
      accept,
    });

    res.send({ message: "Application accepted" });
  }),
);

export default router;

