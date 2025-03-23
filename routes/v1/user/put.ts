import { Router } from "express";
import { body } from "express-validator";
import getTargetUser from "@middleware/getTargetUser";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import assertUserModOrUserTargetUser from "@middleware/assertUserModOrUserTargetUser";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";

const router = Router();

/**
 * Route to edit a user in the database.
 * Can be done by mods or by self.
 * Requires Authentication.
 */
router.put(
  "/",
  rateLimit(),

  body("name"),

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
      name,
      primaryRoles,
      secondaryRoles,
    } = req.body;

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
          name,
        },
        select: {
          id: true,
          name: true,
          bio: true,
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
