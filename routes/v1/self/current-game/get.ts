import db from "@helper/db";
import authUser from "@middleware/authUser";
import getJam from "@middleware/getJam";
import getUser from "@middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import {
  gamePageInclude,
  materializeGamePage,
} from "@helper/gamePages";
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
          pages: {
            where: {
              version: {
                in: ["JAM", "POST_JAM"],
              },
            },
            include: gamePageInclude,
          },
        },
      });

      res.send({
        message: "Games found",
        data: games.map((game) => ({
          ...materializeGamePage(game),
          jamPage: game.pages.find((page) => page.version === "JAM") ?? null,
          postJamPage:
            game.pages.find((page) => page.version === "POST_JAM") ?? null,
        })),
      });
    } catch (error) {
      console.error("Error fetching current game:", error);
      res.status(500).send("Internal server error.");
    }
  }
);

export default router;
