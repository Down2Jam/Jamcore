import { Router } from "express";

import authUser from "../../../middleware/authUser.js";
import getUser from "../../../loaders/getUser.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  achievementConnectionSchema,
  connectAchievementToUser,
} from "@features/achievements";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.post(
  "/",
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { achievementId } = parseBody(req, achievementConnectionSchema);
    const user = requireRequestUser(res);

    await connectAchievementToUser({
      achievementId,
      userId: user.id,
      tenantId: res.locals.tenantId,
    });

    res.send({ message: "Achievement connection created" });
  }),
);

export default router;
