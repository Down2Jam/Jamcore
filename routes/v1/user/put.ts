import { Router } from "express";
import { body, validationResult } from "express-validator";
import getTargetUser from "@middleware/getTargetUser";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import assertUserModOrUserTargetUser from "@middleware/assertUserModOrUserTargetUser";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import { notifyNewMentions } from "@helper/mentionNotifications";

const router = Router();
const PROD_ASSET_PATTERN =
  /^https:\/\/d2jam\.com\/api\/v1\/(image|pfp)\/[A-Za-z0-9._-]+$/;
const DEV_ASSET_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1):\d+\/api\/v1\/(image|pfp)\/[A-Za-z0-9._-]+$/;
const PROD_STATIC_IMAGE_PATTERN =
  /^https:\/\/d2jam\.com\/images\/[A-Za-z0-9._/-]+$/;
const DEV_STATIC_IMAGE_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1):\d+\/images\/[A-Za-z0-9._/-]+$/;
const RELATIVE_STATIC_IMAGE_PATTERN = /^\/images\/[A-Za-z0-9._/-]+$/;
const PREFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;

function buildPrefix(source?: string | null): string {
  const normalized = String(source ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (
    normalized.length >= MIN_PREFIX_LENGTH &&
    normalized.length <= MAX_PREFIX_LENGTH
  ) {
    return normalized;
  }

  let prefix = normalized.slice(0, DEFAULT_PREFIX_LENGTH);
  let seed = 0;
  const seedSource = normalized || "jamjar";
  for (let i = 0; i < seedSource.length; i++) {
    seed = (seed * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  while (prefix.length < DEFAULT_PREFIX_LENGTH) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    prefix += PREFIX_CHARS[seed % PREFIX_CHARS.length];
  }

  return prefix;
}

function isAllowedAssetUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;

  if (process.env.NODE_ENV === "production") {
    return (
      PROD_ASSET_PATTERN.test(value) ||
      PROD_STATIC_IMAGE_PATTERN.test(value) ||
      RELATIVE_STATIC_IMAGE_PATTERN.test(value)
    );
  }

  return (
    DEV_ASSET_PATTERN.test(value) ||
    DEV_STATIC_IMAGE_PATTERN.test(value) ||
    RELATIVE_STATIC_IMAGE_PATTERN.test(value)
  );
}

/**
 * Route to edit a user in the database.
 * Can be done by mods or by self.
 * Requires Authentication.
 */
router.put(
  "/",
  rateLimit(),

  body("name")
    .isString()
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage("Name must be between 1 and 64 characters."),
  body("short")
    .isLength({ max: 155 })
    .withMessage("Short must be at most 155 characters."),
  body("emotePrefix")
    .optional({ values: "falsy" })
    .isLength({ min: MIN_PREFIX_LENGTH, max: MAX_PREFIX_LENGTH })
    .withMessage("Emote prefix must be 4 to 8 characters.")
    .matches(/^[a-z0-9]+$/)
    .withMessage("Emote prefix must be lowercase letters or numbers."),
  body("pronouns")
    .optional({ values: "falsy" })
    .isLength({ max: 32 })
    .withMessage("Pronouns must be at most 32 characters."),
  body("links")
    .optional()
    .isArray({ max: 8 })
    .withMessage("Links must be an array of up to 8 items.")
    .custom((links) =>
      Array.isArray(links)
        ? links.every(
            (link) =>
              typeof link === "string" &&
              link.length <= 200 &&
              link.trim().length > 0,
          )
        : true,
    )
    .withMessage("Links must be non-empty strings."),
  body("recommendedGameIds")
    .optional()
    .isArray({ max: 5 })
    .withMessage("Recommended games must be an array of up to 5 items.")
    .custom((ids) =>
      Array.isArray(ids)
        ? ids.every((id) => Number.isInteger(Number(id)))
        : true,
    )
    .withMessage("Recommended game ids must be numbers."),
  body("recommendedPostIds")
    .optional()
    .isArray({ max: 5 })
    .withMessage("Recommended posts must be an array of up to 5 items.")
    .custom((ids) =>
      Array.isArray(ids)
        ? ids.every((id) => Number.isInteger(Number(id)))
        : true,
    )
    .withMessage("Recommended post ids must be numbers."),
  body("recommendedTrackIds")
    .optional()
    .isArray({ max: 5 })
    .withMessage("Recommended tracks must be an array of up to 5 items.")
    .custom((ids) =>
      Array.isArray(ids)
        ? ids.every((id) => Number.isInteger(Number(id)))
        : true,
    )
    .withMessage("Recommended track ids must be numbers."),
  body("linkLabels")
    .optional()
    .isArray({ max: 8 })
    .withMessage("Link labels must be an array of up to 8 items.")
    .custom((labels) =>
      Array.isArray(labels)
        ? labels.every(
            (label) =>
              typeof label === "string" &&
              label.length <= 40 &&
              label.trim().length >= 0,
          )
        : true,
    )
    .withMessage("Link labels must be strings."),
  body("profilePicture")
    .custom((value) => isAllowedAssetUrl(value))
    .withMessage("Invalid profile picture URL."),
  body("bannerPicture")
    .custom((value) => isAllowedAssetUrl(value))
    .withMessage("Invalid banner picture URL."),

  authUser,
  getUser,
  getTargetUser,
  assertUserModOrUserTargetUser,

  async (req, res) => {
    const {
      email,
      profilePicture,
      bannerPicture,
      bio,
      short,
      name,
      primaryRoles,
      secondaryRoles,
      emotePrefix,
      pronouns,
      links,
      profileBackground,
      linkLabels,
      recommendedGameIds,
      recommendedPostIds,
      recommendedTrackIds,
    } = req.body;

    const validation = validationResult(req);
    if (!validation.isEmpty()) {
      return res.status(400).json({
        message: "Invalid request",
        errors: validation.array(),
      });
    }

    try {
      const oldPrefix = res.locals.user.emotePrefix ?? null;
      let cleanedPrefix = emotePrefix
        ? String(emotePrefix).trim().toLowerCase()
        : null;

      if (!cleanedPrefix) {
        cleanedPrefix = buildPrefix(name ?? res.locals.user.name ?? res.locals.user.slug);
      }

      const normalizedLinks = Array.isArray(links)
        ? links.map((link: string) => link.trim()).filter(Boolean)
        : undefined;
      const normalizedLabels = Array.isArray(linkLabels)
        ? linkLabels.map((label: string) => label.trim())
        : undefined;

      if (
        normalizedLinks &&
        normalizedLabels &&
        normalizedLinks.length !== normalizedLabels.length
      ) {
        res.status(400).send({ message: "Link labels must match links." });
        return;
      }

      const rawGameIds = Array.isArray(recommendedGameIds)
        ? recommendedGameIds.map((id: number | string) => Number(id))
        : [];
      const rawPostIds = Array.isArray(recommendedPostIds)
        ? recommendedPostIds.map((id: number | string) => Number(id))
        : [];
      const rawTrackIds = Array.isArray(recommendedTrackIds)
        ? recommendedTrackIds.map((id: number | string) => Number(id))
        : [];

      const [existingGames, existingPosts, existingTracks] = await Promise.all([
        rawGameIds.length
          ? db.game.findMany({
              where: { id: { in: rawGameIds } },
              select: { id: true },
            })
          : Promise.resolve([]),
        rawPostIds.length
          ? db.post.findMany({
              where: { id: { in: rawPostIds } },
              select: { id: true },
            })
          : Promise.resolve([]),
        rawTrackIds.length
          ? db.track.findMany({
              where: { id: { in: rawTrackIds } },
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);

      const existingGameIds = new Set(existingGames.map((g) => g.id));
      const existingPostIds = new Set(existingPosts.map((p) => p.id));
      const existingTrackIds = new Set(existingTracks.map((t) => t.id));

      if (
        (rawGameIds.length && existingGameIds.size !== rawGameIds.length) ||
        (rawPostIds.length && existingPostIds.size !== rawPostIds.length) ||
        (rawTrackIds.length && existingTrackIds.size !== rawTrackIds.length)
      ) {
        res.status(400).send({ message: "Invalid recommendation ids." });
        return;
      }

      const recommendedGames = existingGames.map((g) => ({ id: g.id }));
      const recommendedPosts = existingPosts.map((p) => ({ id: p.id }));
      const recommendedTracks = existingTracks.map((t) => ({ id: t.id }));

      const user = await db.user.update({
        where: {
          id: res.locals.user.id,
        },
        data: {
          email: email ? email : null,
          profilePicture,
          bannerPicture,
          profileBackground,
          bio,
          short,
          name,
          pronouns,
          links: normalizedLinks,
          linkLabels: normalizedLabels,
          emotePrefix: cleanedPrefix,
          ...(Array.isArray(recommendedGameIds)
            ? {
                recommendedGames: {
                  set: recommendedGames,
                },
              }
            : {}),
          ...(Array.isArray(recommendedPostIds)
            ? {
                recommendedPosts: {
                  set: recommendedPosts,
                },
              }
            : {}),
          ...(Array.isArray(recommendedTrackIds)
            ? {
                recommendedTracks: {
                  set: recommendedTracks,
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          bio: true,
          short: true,
          profilePicture: true,
          profileBackground: true,
          createdAt: true,
          slug: true,
          mod: true,
          admin: true,
          jams: true,
          bannerPicture: true,
          pronouns: true,
          links: true,
          linkLabels: true,
          emotePrefix: true,
          primaryRoles: { select: { slug: true } },
          secondaryRoles: { select: { slug: true } },
          recommendedGames: {
            select: {
              id: true,
              name: true,
              slug: true,
              thumbnail: true,
            },
          },
          recommendedPosts: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
          recommendedTracks: {
            select: {
              id: true,
              name: true,
              url: true,
              composer: { select: { name: true } },
              game: { select: { name: true, slug: true, thumbnail: true } },
            },
          },
        },
      });

      await notifyNewMentions({
        type: "profile",
        actorId: res.locals.user.id,
        actorName: res.locals.user.name,
        actorSlug: res.locals.user.slug,
        beforeContent: res.locals.targetUser?.bio ?? "",
        afterContent: bio,
        profileSlug: user.slug,
      });

      if (cleanedPrefix && cleanedPrefix !== oldPrefix) {
        const userReactions = await db.reaction.findMany({
          where: {
            scopeType: "USER",
            scopeUserId: res.locals.user.id,
          },
          select: { id: true, slug: true },
        });

        if (userReactions.length > 0) {
          const suffixLength = oldPrefix ? oldPrefix.length : 6;
          const updates = userReactions.map((reaction) => {
            const suffix = reaction.slug.slice(suffixLength);
            const nextSlug = `${cleanedPrefix}${suffix}`;
            return { id: reaction.id, slug: nextSlug };
          });

          const nextSlugs = updates.map((u) => u.slug);
          const uniqueNext = new Set(nextSlugs);
          if (uniqueNext.size !== nextSlugs.length) {
            res
              .status(409)
              .send({ message: "Emote prefix causes duplicates." });
            return;
          }

          const conflicts = await db.reaction.findMany({
            where: {
              slug: { in: nextSlugs },
              NOT: { id: { in: updates.map((u) => u.id) } },
            },
            select: { id: true },
          });
          if (conflicts.length > 0) {
            res.status(409).send({ message: "Emote prefix already in use." });
            return;
          }

          await db.$transaction(
            updates.map((update) =>
              db.reaction.update({
                where: { id: update.id },
                data: { slug: update.slug },
              }),
            ),
          );
        }
      }

      const currentPrimaryRoles = user.primaryRoles.map((role) => role.slug);
      const currentSecondaryRoles = user.secondaryRoles.map(
        (role) => role.slug,
      );

      const primaryRolesToDisconnect = currentPrimaryRoles.filter(
        (role) => !primaryRoles.includes(role),
      );
      const secondaryRolesToDisconnect = currentSecondaryRoles.filter(
        (role) => !secondaryRoles.includes(role),
      );

      await db.user.update({
        where: { id: user.id },
        data: {
          primaryRoles: {
            disconnect: primaryRolesToDisconnect.map((slug) => ({
              slug,
            })),
            connect: primaryRoles.map((roleSlug: string) => ({
              slug: roleSlug,
            })),
          },
          secondaryRoles: {
            disconnect: secondaryRolesToDisconnect.map((slug) => ({
              slug,
            })),
            connect: secondaryRoles.map((roleSlug: string) => ({
              slug: roleSlug,
            })),
          },
        },
      });

      res.status(200).send({ message: "User updated", data: user });
    } catch (error) {
      console.error("Failed to update user: ", error);
      res.status(500).send({ message: "Failed to update user" });
    }
  },
);

export default router;
