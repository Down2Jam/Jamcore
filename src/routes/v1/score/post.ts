import express from "express";

import authUser from "../../../middleware/authUser";
import { allowGameToken } from "../../../middleware/allowGameToken.js";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import getLeaderboard from "@loaders/getLeaderboard";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { createScore, createScoreSchema } from "@features/scores";
import { requireLoadedLeaderboard, requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";
import { assertGameTokenMatchesGame } from "../../../guards/assertGameTokenMatchesGame.js";

const router = express.Router();

router.use(allowGameToken);

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  getLeaderboard,
  assertGameTokenMatchesGame((res) => {
    const leaderboard = res.locals.leaderboard as
      | { gamePage?: { game?: { id?: number } } }
      | undefined;
    return leaderboard?.gamePage?.game?.id;
  }),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createScoreSchema);
    const actor = requireRequestUser(res);
    const leaderboard = requireLoadedLeaderboard(res);

    await createScore({
      input,
      actor,
      leaderboard,
    });

    res.status(200).send({ message: "Score added" });
  }),
);

export default router;

