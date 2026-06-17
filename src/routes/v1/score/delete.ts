import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import assertUserModOrUserTeamMemberOrUserScoreOwner from "@guards/assertUserModOrUserScoreOwner";
import getScore from "@loaders/getScore";
import getScoreLeaderboard from "@loaders/getScoreLeaderboard";
import getLeaderboardGame from "@loaders/getLeaderboardGame";
import getGameTeam from "@loaders/getGameTeam";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { deleteScore } from "@features/scores";

const router = express.Router();

router.delete(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getScore,
  getScoreLeaderboard,
  getLeaderboardGame,
  getGameTeam,
  assertUserModOrUserTeamMemberOrUserScoreOwner,
  asyncHandler(async (_req, res) => {
    await deleteScore(res.locals.score.id);
    res.status(200).send({ message: "Score deleted" });
  }),
);

export default router;

