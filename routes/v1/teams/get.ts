import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import getTargetUserOptional from "@middleware/getTargetUserOptional";

const router = Router();

/**
 * Route to get teams from the database.
 */
router.get(
  "/",
  rateLimit(),

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
              downloadLinks: true,
              tags: true,
              flags: true,
              leaderboards: true,
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
              downloadLinks: true,
              tags: true,
              flags: true,
              leaderboards: true,
            },
          },
        },
      });
    }

    res.send({ message: "Teams fetched", data: teams });
  }
);

export default router;
