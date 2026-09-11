import { Router } from "express";

import authUser from "../../../middleware/authUser.js";
import { allowGameToken } from "../../../middleware/allowGameToken.js";
import getUser from "../../../loaders/getUser.js";
import getAchievementGame from "../../../loaders/getAchievementGame.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  achievementConnectionSchema,
  disconnectAchievementFromUser,
} from "@features/achievements";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";
import { assertGameTokenMatchesGame } from "../../../guards/assertGameTokenMatchesGame.js";

const router = Router();

router.use(allowGameToken);

router.delete(
  "/",
  authUser,
  getUser,
  getAchievementGame,
  assertGameTokenMatchesGame((res) => res.locals.game?.id),
  asyncHandler(async (req, res) => {
    const { achievementId } = parseBody(req, achievementConnectionSchema);
    const user = requireRequestUser(res);

    await disconnectAchievementFromUser({
      achievementId,
      userId: user.id,
      tenantId: res.locals.tenantId,
    });

    res.send({ message: "Achievement connection deleted" });
  }),
);

export default router;
