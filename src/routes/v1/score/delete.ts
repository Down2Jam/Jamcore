import express from "express";
import authUser from "../../../middleware/authUser";
import { allowGameToken } from "../../../middleware/allowGameToken.js";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import assertUserModOrUserTeamMemberOrUserScoreOwner from "@guards/assertUserModOrUserScoreOwner";
import getScore from "@loaders/getScore";
import getScoreLeaderboard from "@loaders/getScoreLeaderboard";
import getLeaderboardGame from "@loaders/getLeaderboardGame";
import getGameTeam from "@loaders/getGameTeam";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { deleteScore } from "@features/scores";
import { assertGameTokenMatchesGame } from "../../../guards/assertGameTokenMatchesGame.js";

const router = express.Router();

router.use(allowGameToken);

router.delete(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getScore,
  getScoreLeaderboard,
  getLeaderboardGame,
  assertGameTokenMatchesGame((res) => res.locals.game?.id),
  getGameTeam,
  assertUserModOrUserTeamMemberOrUserScoreOwner,
  asyncHandler(async (_req, res) => {
    await deleteScore(res.locals.score.id);
    res.status(200).send({ message: "Score deleted" });
  }),
);

export default router;

