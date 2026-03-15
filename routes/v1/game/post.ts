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
const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;
const PREFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const ITCH_EMBED_ASPECT_RATIOS = new Set([
  "16 / 9",
  "16 / 10",
  "21 / 9",
  "4 / 3",
  "5 / 4",
  "1 / 1",
  "3 / 2",
  "2 / 3",
  "3 / 4",
  "9 / 16",
  "10 / 16",
]);

const backgroundUsageAllowedByDefault = (license?: string | null) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();

  return normalized === "CC0" || normalized === "CC BY";
};

const backgroundUsageAttributionAllowedByDefault = (
  license?: string | null,
) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();

  return normalized !== "CC0";
};

const buildPrefix = (seed?: string | null) => {
  const normalized = (seed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    normalized.length >= MIN_PREFIX_LENGTH &&
    normalized.length <= MAX_PREFIX_LENGTH
  ) {
    return normalized;
  }

  const base = normalized.slice(0, DEFAULT_PREFIX_LENGTH);
  let prefix = base;
  for (let i = prefix.length; i < DEFAULT_PREFIX_LENGTH; i += 1) {
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
  body("itchEmbedAspectRatio")
    .optional({ nullable: true })
    .isIn([
      "16 / 9",
      "16 / 10",
      "21 / 9",
      "4 / 3",
      "5 / 4",
      "1 / 1",
      "3 / 2",
      "2 / 3",
      "3 / 4",
      "9 / 16",
      "10 / 16",
    ]),

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
      itchEmbedAspectRatio,
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
        if (!/^[a-z0-9]{4,8}$/.test(cleanedPrefix)) {
          res
            .status(400)
            .send({ message: "Emote prefix must be 4 to 8 characters." });
          return;
        }
      } else {
        cleanedPrefix = buildPrefix(slug);
      }

      if (
        itchEmbedAspectRatio != null &&
        !ITCH_EMBED_ASPECT_RATIOS.has(String(itchEmbedAspectRatio))
      ) {
        res.status(400).send({ message: "Invalid itch embed aspect ratio." });
        return;
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
          itchEmbedAspectRatio,
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
              commentary: song.commentary || null,
              bpm:
                typeof song.bpm === "number" && Number.isFinite(song.bpm)
                  ? Math.max(1, Math.floor(song.bpm))
                  : null,
              musicalKey: song.musicalKey || null,
              softwareUsed: Array.isArray(song.softwareUsed)
                ? song.softwareUsed.filter(Boolean)
                : [],
              license: song.license || null,
              allowDownload: Boolean(song.allowDownload),
              allowBackgroundUse:
                typeof song.allowBackgroundUse === "boolean"
                  ? song.allowBackgroundUse
                  : backgroundUsageAllowedByDefault(song.license),
              allowBackgroundUseAttribution:
                typeof song.allowBackgroundUseAttribution === "boolean"
                  ? song.allowBackgroundUseAttribution
                  : backgroundUsageAttributionAllowedByDefault(song.license),
              composer: {
                connect: {
                  id:
                    (Array.isArray(song.credits)
                      ? song.credits
                          .map((credit: { role?: string; userId?: number | string }) => ({
                            role: String(credit?.role ?? "").trim(),
                            userId: Number(credit?.userId),
                          }))
                          .find(
                            (credit) =>
                              credit.role.toLowerCase() === "composer" &&
                              Number.isInteger(credit.userId),
                          )?.userId ??
                        song.credits
                          .map((credit: { role?: string; userId?: number | string }) => ({
                            role: String(credit?.role ?? "").trim(),
                            userId: Number(credit?.userId),
                          }))
                          .find((credit) => Number.isInteger(credit.userId))
                          ?.userId
                      : null) ?? song.composerId,
                },
              },
            tags: {
              connect: Array.isArray(song.tagIds)
                ? song.tagIds
                      .map((id: number | string) => Number(id))
                      .filter((id: number) => Number.isInteger(id))
                      .map((id: number) => ({ id }))
                  : [],
              },
              flags: {
                connect: Array.isArray(song.flagIds)
                  ? song.flagIds
                      .map((id: number | string) => Number(id))
                      .filter((id: number) => Number.isInteger(id))
                      .map((id: number) => ({ id }))
                  : [],
              },
              links: {
                create: Array.isArray(song.links)
                  ? song.links
                      .map((link: { label?: string; url?: string }) => ({
                        label: String(link?.label ?? "").trim(),
                        url: String(link?.url ?? "").trim(),
                      }))
                      .filter((link) => link.label && link.url)
                  : [],
              },
              credits: {
                create: Array.isArray(song.credits)
                  ? song.credits
                      .map((credit: { role?: string; userId?: number | string }) => ({
                        role: String(credit?.role ?? "").trim(),
                        userId: Number(credit?.userId),
                      }))
                      .filter(
                        (credit) =>
                          credit.role.length > 0 && Number.isInteger(credit.userId),
                      )
                  : [],
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
