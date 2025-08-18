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
    logger.info(`Users fetched`);
    const users = await db.user.findMany({
      take: 10,
      orderBy: {
        id: "desc",
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
      },
    });

    res.send({ message: "Users fetched", data: users });
  }
);

export default router;
