import { Router } from "express";
import { body, validationResult } from "express-validator";
import getTargetUser from "@middleware/getTargetUser";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import assertUserModOrUserTargetUser from "@middleware/assertUserModOrUserTargetUser";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";

const router = Router();
const PROD_ASSET_PATTERN = /^https:\/\/d2jam\.com\/api\/v1\/(image|pfp)\/[A-Za-z0-9._-]+$/;
const DEV_ASSET_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1):\d+\/api\/v1\/(image|pfp)\/[A-Za-z0-9._-]+$/;

function isAllowedAssetUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;

  if (process.env.NODE_ENV === "production") {
    return PROD_ASSET_PATTERN.test(value);
  }

  return DEV_ASSET_PATTERN.test(value);
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
    .isLength({ max: 32 })
    .withMessage("Short must be at most 32 characters."),
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
    } = req.body;

    const validation = validationResult(req);
    if (!validation.isEmpty()) {
      return res.status(400).json({
        message: "Invalid request",
        errors: validation.array(),
      });
    }

    try {
      const user = await db.user.update({
        where: {
          id: res.locals.user.id,
        },
        data: {
          email: email ? email : null,
          profilePicture,
          bannerPicture,
          bio,
          short,
          name,
        },
        select: {
          id: true,
          name: true,
          bio: true,
          short: true,
          profilePicture: true,
          createdAt: true,
          slug: true,
          mod: true,
          admin: true,
          jams: true,
          bannerPicture: true,
          primaryRoles: { select: { slug: true } },
          secondaryRoles: { select: { slug: true } },
        },
      });

      const currentPrimaryRoles = user.primaryRoles.map((role) => role.slug);
      const currentSecondaryRoles = user.secondaryRoles.map(
        (role) => role.slug
      );

      const primaryRolesToDisconnect = currentPrimaryRoles.filter(
        (role) => !primaryRoles.includes(role)
      );
      const secondaryRolesToDisconnect = currentSecondaryRoles.filter(
        (role) => !secondaryRoles.includes(role)
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
  }
);

export default router;
