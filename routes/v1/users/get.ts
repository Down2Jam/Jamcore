import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import logger from "@helper/logger";
import db from "@helper/db";

const router = Router();

/**
 * Route to get users from the database.
 */
router.get(
  "/",
  rateLimit(),

  async (_req, res) => {
    const users = await db.user.findMany({
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
        name: true,
        profilePicture: true,
        slug: true,
        teams: {
          select: {
            game: {
              select: {
                published: true,
              },
            },
          },
        },
      },
    });

    res.send({ message: "Users fetched", data: users });
  }
);

export default router;
