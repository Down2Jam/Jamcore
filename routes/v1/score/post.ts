import express from "express";

import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import getLeaderboard from "@loaders/getLeaderboard";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { createScore, createScoreSchema } from "@features/scores";
import { requireLoadedLeaderboard, requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = express.Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  getLeaderboard,
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

