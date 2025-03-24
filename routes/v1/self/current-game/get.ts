import db from "@helper/db";
import authUser from "@middleware/authUser";
import getJam from "@middleware/getJam";
import getUser from "@middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import { Router } from "express";

const router = Router();

router.get(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getJam,

  async (req, res) => {
    const { username } = req.query;

    if (!username) {
      res.status(400).send("Username is required");
      return;
    }

    try {
      const games = await db.game.findMany({
        where: {
          team: {
            users: {
              some: {
                id: res.locals.user.id,
              },
            },
          },
          jamId: res.locals.jam.id,
        },
        include: {
          downloadLinks: true,
          ratingCategories: true,
          tags: true,
          flags: true,
          leaderboards: true,
          achievements: true,
          comments: true,
        },
      });

      res.send({ message: "Games found", data: games });
    } catch (error) {
      console.error("Error fetching current game:", error);
      res.status(500).send("Internal server error.");
    }
  }
);

export default router;
