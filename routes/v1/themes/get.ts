import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import authenticateUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import getJam from "@middleware/getJam";
import { checkJamParticipation } from "services/jamService";

const router = Router();

/**
 * Route to get themes from the database.
 */
router.get(
  "/",
  rateLimit(),
  authenticateUser,
  getUser,
  getJam,
  checkJamParticipation,

  async (req, res) => {
    const { isVoting } = req.query;

    let themes;

    if (isVoting == "1") {
      const themesWithScores = await db.themeVote.groupBy({
        by: ["themeSuggestionId"],
        _sum: {
          slaughterScore: true,
        },
        orderBy: [
          {
            _sum: {
              slaughterScore: "desc",
            },
          },
          {
            themeSuggestionId: "asc",
          },
        ],
        where: {
          jamId: res.locals.jam.id,
        },
        take: 15,
      });

      const themeIds = themesWithScores.map((t) => t.themeSuggestionId);

      const prethemes = await db.themeSuggestion.findMany({
        where: {
          id: { in: themeIds },
          jamId: res.locals.jam.id,
        },
        include: {
          votes2: {
            where: {
              userId: res.locals.user.id,
            },
          },
        },
      });

      themes = themesWithScores.map((ts) => ({
        ...prethemes.find((t) => t.id === ts.themeSuggestionId),
        slaughterScoreSum: ts._sum.slaughterScore,
      }));
    } else {
      themes = await db.themeSuggestion.findMany({
        include: {
          votes: {
            where: {
              userId: res.locals.user.id,
            },
          },
        },
        where: {
          jamId: res.locals.jam.id,
        },
      });
    }

    res.send({ message: "Themes fetched", data: themes });
  }
);

export default router;
