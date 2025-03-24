import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import logger from "@helper/logger";
import { body } from "express-validator";
import getLeaderboard from "@middleware/getLeaderboard";

var router = express.Router();

router.post(
  "/",
  rateLimit(),

  body("score").isNumeric().withMessage({
    message: "Please enter a valid score",
  }),
  body("evidenceUrl").isString().withMessage({
    message: "Please enter a valid evidence url",
  }),

  authUser,
  getUser,
  getLeaderboard,

  async (req, res) => {
    const { score, evidence } = req.body;

    try {
      await db.score.create({
        data: {
          evidence,
          data: score,
          userId: res.locals.user.id,
          leaderboardId: res.locals.leaderboard.id,
        },
      });

      res.status(200).send({ message: "Score added" });
    } catch (error) {
      logger.error("Failed to add score: ", error);
      res.status(500).send({ message: "Failed to add score" });
    }
  }
);

export default router;
