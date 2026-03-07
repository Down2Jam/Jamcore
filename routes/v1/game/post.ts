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
import { notifyNewMentions } from "@helper/mentionNotifications";
import { Router } from "express";
import { body } from "express-validator";

const router = Router();
const PREFIX_LENGTH = 6;
const PREFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

const buildPrefix = (seed?: string | null) => {
  const normalized = (seed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = normalized.slice(0, PREFIX_LENGTH);
  let prefix = base;
  for (let i = prefix.length; i < PREFIX_LENGTH; i += 1) {
    prefix += PREFIX_CHARS[Math.floor(Math.random() * PREFIX_CHARS.length)];
  }
  return prefix;
};

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
  assertJamPhaseIn(["Jamming", "Submission", "Rating"]),
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
      short,
      songs,
      screenshots,
      trailerUrl,
      itchEmbedUrl,
      inputMethods,
      estOneRun,
      estAnyPercent,
      estHundredPercent,
      emotePrefix,
    } = req.body;

    try {
      let cleanedPrefix = emotePrefix
        ? String(emotePrefix).trim().toLowerCase()
        : null;
      if (cleanedPrefix) {
        if (!/^[a-z0-9]{6}$/.test(cleanedPrefix)) {
          res.status(400).send({ message: "Emote prefix must be 6 characters." });
          return;
        }
      } else {
        cleanedPrefix = buildPrefix(slug);
      }

      const game = await db.game.create({
        data: {
          name,
          slug,
          description,
          thumbnail,
          banner,
          jamId: res.locals.jam.id,
          emotePrefix: cleanedPrefix,
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
          short,
          published,
          themeJustification,
          screenshots: Array.isArray(screenshots) ? screenshots : [],
          trailerUrl,
          itchEmbedUrl,
          inputMethods: Array.isArray(inputMethods) ? inputMethods : [],
          estOneRun,
          estAnyPercent,
          estHundredPercent,
          achievements: {
            create: achievements.map((achievement: any) => ({
              name: achievement.name,
              description: achievement.description
                ? achievement.description
                : "",
              image: achievement.image ? achievement.image : "",
            })),
          },
          tracks: {
            create: songs.map((song: any) => ({
              name: song.name,
              slug: song.slug,
              url: song.url,
              license: song.license || null,
              allowDownload: Boolean(song.allowDownload),
              composer: {
                connect: {
                  id: song.composerId,
                },
              },
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

      await notifyNewMentions({
        type: "game",
        actorId: res.locals.user.id,
        actorName: res.locals.user.name,
        actorSlug: res.locals.user.slug,
        beforeContent: "",
        afterContent: description,
        gameId: game.id,
        gameSlug: game.slug,
        gameName: game.name,
      });

      res.status(201).json(game);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(500).send("Internal server error.");
    }
  }
);

export default router;
