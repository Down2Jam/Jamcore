import db from "@helper/db";
import assertJamPhase from "@middleware/assertJamPhase";
import assertJamPhaseIn from "@middleware/assertJamPhaseIn";
import assertTargetTeamDoesNotHaveGame from "@middleware/assertTargetTeamDoesNotHaveGame";
import assertUserIsInTargetTeam from "@middleware/assertUserIsInTargetTeam";
import authUser from "@middleware/authUser";
import getJam from "@middleware/getJam";
import getTargetTeam from "@middleware/getTargetTeam";
import getUser from "@middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import { Router } from "express";
import { body } from "express-validator";

const router = Router();

router.post(
  "/",
  rateLimit(),

  body("name").isString().withMessage({
    message: "Please enter a valid name",
  }),
  body("slug").isString().withMessage({
    message: "Please enter a valid slug",
  }),
  body("category").isString().isIn(["ODA", "REGULAR", "EXTRA"]).withMessage({
    message: "Please enter a valid category",
  }),
  body("ratingCategories").isArray().withMessage({
    message: "Please enter a valid rating category array",
  }),
  body("achievements").isArray().withMessage({
    message: "Please enter a valid achievements array",
  }),
  body("flags").isArray().withMessage({
    message: "Please enter a valid flags array",
  }),
  body("tags").isArray().withMessage({
    message: "Please enter a valid tags array",
  }),
  body("leaderboards").isArray().withMessage({
    message: "Please enter a valid leaderboards array",
  }),

  authUser,
  getUser,
  getJam,
  getTargetTeam,
  assertJamPhaseIn(["Jamming", "Submission"]),
  assertUserIsInTargetTeam,
  assertTargetTeamDoesNotHaveGame,

  async function (req, res) {
    const {
      name,
      slug,
      description,
      thumbnail,
      banner,
      downloadLinks,
      category,
      ratingCategories,
      majRatingCategories,
      published,
      themeJustification,
      achievements,
      flags,
      tags,
      leaderboards,
    } = req.body;

    try {
      const game = await db.game.create({
        data: {
          name,
          slug,
          description,
          thumbnail,
          banner,
          jamId: res.locals.jam.id,
          downloadLinks: {
            create: downloadLinks.map(
              (link: { url: string; platform: string }) => ({
                url: link.url,
                platform: link.platform,
              })
            ),
          },
          ratingCategories: {
            connect: ratingCategories.map((id: number) => ({
              id: id,
            })),
          },
          majRatingCategories: {
            connect: majRatingCategories.map((id: number) => ({
              id: id,
            })),
          },
          teamId: res.locals.targetTeam.id,
          category,
          published,
          themeJustification,
          achievements: {
            create: achievements.map((achievement: any) => ({
              name: achievement.name,
              description: achievement.description
                ? achievement.description
                : "",
              image: achievement.image ? achievement.image : "",
            })),
          },
          leaderboards: {
            create: leaderboards.map((leaderboard: any) => ({
              type: leaderboard.type,
              name: leaderboard.name,
              onlyBest: leaderboard.onlyBest,
              maxUsersShown: leaderboard.maxUsersShown,
            })),
          },
          tags: {
            connect: tags.map((id: number) => ({
              id: id,
            })),
          },
          flags: {
            connect: flags.map((id: number) => ({
              id: id,
            })),
          },
        },
        include: {
          downloadLinks: true,
        },
      });

      res.status(201).json(game);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(500).send("Internal server error.");
    }
  }
);

export default router;
