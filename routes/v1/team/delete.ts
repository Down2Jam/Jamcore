import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import getTargetTeam from "@middleware/getTargetTeam";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";
import logger from "@helper/logger";
import assertUserModOrUserTargetTeamOwner from "@middleware/assertUserModOrUserTargetTeamOwner";

var router = express.Router();

router.delete(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getTargetTeam,
  assertUserModOrUserTargetTeamOwner,

  async (_req, res) => {
    try {
      if (res.locals.targetTeam.game) {
        if (res.locals.targetTeam.game.leaderboards) {
          for (const leaderboard of res.locals.targetTeam.game.leaderboards) {
            await db.leaderboard.delete({
              where: {
                id: leaderboard.id,
              },
            });
          }
        }

        if (res.locals.targetTeam.game.achievements) {
          for (const achievement of res.locals.targetTeam.game.achievements) {
            await db.achievement.delete({
              where: {
                id: achievement.id,
              },
            });
          }
        }

        if (res.locals.targetTeam.game.downloadLinks) {
          for (const link of res.locals.targetTeam.game.downloadLinks) {
            await db.gameDownloadLink.delete({
              where: {
                id: link.id,
              },
            });
          }
        }

        if (res.locals.targetTeam.game.ratings) {
          for (const rating of res.locals.targetTeam.game.ratings) {
            await db.rating.delete({
              where: {
                id: rating.id,
              },
            });
          }
        }

        if (res.locals.targetTeam.game.tracks) {
          for (const track of res.locals.targetTeam.game.tracks) {
            await db.track.delete({
              where: {
                id: track.id,
              },
            });
          }
        }

        if (res.locals.targetTeam.game.ghosts) {
          for (const ghost of res.locals.targetTeam.game.ghosts) {
            await db.ghost.delete({
              where: {
                id: ghost.id,
              },
            });
          }
        }

        if (res.locals.targetTeam.game.data) {
          for (const data of res.locals.targetTeam.game.data) {
            await db.data.delete({
              where: {
                id: data.id,
              },
            });
          }
        }

        await db.game.delete({
          where: {
            id: res.locals.targetTeam.game.id,
          },
        });
      }

      if (res.locals.targetTeam.applications) {
        for (const application of res.locals.targetTeam.applications) {
          await db.teamApplication.delete({
            where: {
              id: application.id,
            },
          });
        }
      }

      if (res.locals.targetTeam.invites) {
        for (const invite of res.locals.targetTeam.invites) {
          await db.teamInvite.delete({
            where: {
              id: invite.id,
            },
          });
        }
      }

      await db.team.delete({
        where: {
          id: res.locals.targetTeam.id,
        },
      });

      logger.info(`Deleted team with id ${res.locals.targetTeam.id}`);
      res.status(200).send({ message: "Team deleted" });
    } catch (error) {
      logger.error("Failed to delete team: ", error);
      res.status(500).send({ message: "Failed to delete team" });
    }
  }
);

export default router;
