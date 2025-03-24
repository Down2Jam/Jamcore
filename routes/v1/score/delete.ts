import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import logger from "@helper/logger";
import assertUserModOrUserTeamMemberOrUserScoreOwner from "@middleware/assertUserModOrUserTeamMemberOrUserScoreOwner";
import getScore from "@middleware/getScore";
import getScoreLeaderboard from "@middleware/getScoreLeaderboard";
import getLeaderboardGame from "@middleware/getLeaderboardGame";
import getGameTeam from "@middleware/getGameTeam";

var router = express.Router();

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

  async (_req, res) => {
    try {
      await db.score.delete({
        where: {
          id: res.locals.score.id,
        },
      });

      logger.info(`Deleted score with id ${res.locals.score.id}`);
      res.status(200).send({ message: "Score deleted" });
    } catch (error) {
      logger.error("Failed to delete score: ", error);
      res.status(500).send({ message: "Failed to delete score" });
    }
  }
);

export default router;
