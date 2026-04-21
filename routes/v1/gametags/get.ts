import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

/**
 * Route to get the game tags from the database.
 */
router.get(
  "/",
  rateLimit(),

  async (_req, res) => {
    const tags = await db.tag.findMany({
      orderBy: { name: "asc" },
      include: { category: true },
      where: {
        gameTag: true,
      },
    });

    res.send({
      message: "Tags fetched",
      data: tags,
    });
  }
);

export default router;
