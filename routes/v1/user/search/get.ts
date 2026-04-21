import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

/**
 * Route to search for users.
 */
router.get(
  "/",
  rateLimit(),

  async (req, res) => {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).send("Search query is required");
      return;
    }

    try {
      const users = await db.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          profilePicture: true,
        },
        take: 5, // Limit results
      });
      res.json(users);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).send("Internal server error");
    }
  }
);

export default router;
