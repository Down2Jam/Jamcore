import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import getTargetUserOptional from "@middleware/getTargetUserOptional";
import {
  gamePageInclude,
  materializeGamePage,
} from "@helper/gamePages";

const router = Router();

/**
 * Route to get teams from the database.
 */
router.get(
  "/",
  rateLimit(60),

  getTargetUserOptional,

  async (_req, res) => {
    let teams;

    if (res.locals.targetUser) {
      teams = await db.team.findMany({
        where: {
          users: {
            some: {
              id: res.locals.targetUser.id,
            },
          },
        },
        include: {
          users: {
            include: {
              primaryRoles: true,
              secondaryRoles: true,
            },
          },
          game: {
            include: {
              jam: true,
              pages: {
                where: {
                  version: {
                    in: ["JAM", "POST_JAM"],
                  },
                },
                include: gamePageInclude,
              },
            },
          },
          owner: true,
          rolesWanted: true,
          invites: {
            include: {
              user: true,
            },
          },
          applications: {
            include: {
              user: true,
            },
          },
        },
      });
    } else {
      teams = await db.team.findMany({
        include: {
          users: true,
          owner: true,
          rolesWanted: true,
          game: {
            include: {
              jam: true,
              pages: {
                where: {
                  version: {
                    in: ["JAM", "POST_JAM"],
                  },
                },
                include: gamePageInclude,
              },
            },
          },
        },
      });
    }

    res.send({
      message: "Teams fetched",
      data: teams.map((team) => ({
        ...team,
        game: team.game
          ? {
              ...materializeGamePage(team.game),
              jamPage:
                team.game.pages.find((page) => page.version === "JAM") ?? null,
              postJamPage:
                team.game.pages.find((page) => page.version === "POST_JAM") ??
                null,
            }
          : null,
      })),
    });
  }
);

export default router;
