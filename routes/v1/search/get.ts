import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import logger from "@helper/logger";
import { query, validationResult } from "express-validator";
import db from "@helper/db";

const router = Router();

/**
 * Route to search the database for something
 */
router.get(
  "/",
  rateLimit(),

  query("query").notEmpty().isString().withMessage({
    message: "Please enter a valid search query",
  }),
  query("type").optional().isString().withMessage({
    message: "Please enter a valid search type",
  }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { query, type } = req.query;

    const searchTypes = !type
      ? ["games", "users", "posts", "tracks", "teams"]
      : typeof type === "string"
      ? type.split("&")
      : [];

    const data: Record<string, Record<string, string | number>> = {};

    // TODO: Prevent code injection here

    if (searchTypes.includes("games")) {
      data["games"] = await db.$queryRaw`
        SELECT id, name, slug
        FROM "Game" 
        WHERE name % ${query} 
        ORDER BY name <-> ${query} ASC
        LIMIT 2;`;
    }

    if (searchTypes.includes("users")) {
      data["users"] = await db.$queryRaw`
        SELECT id, name, slug, "bannerPicture", "profilePicture", short
        FROM "User" 
        WHERE name % ${query} 
        ORDER BY name <-> ${query} ASC
        LIMIT 2;`;
    }

    if (searchTypes.includes("posts")) {
      data["posts"] = await db.$queryRaw`
        SELECT id, title, slug
        FROM "Post" 
        WHERE title % ${query} 
        ORDER BY title <-> ${query} ASC
        LIMIT 2;`;
    }

    if (searchTypes.includes("tracks")) {
      data["tracks"] = await db.$queryRaw`
        SELECT id, name
        FROM "Track" 
        WHERE name % ${query} 
        ORDER BY name <-> ${query} ASC
        LIMIT 2;`;
    }

    if (searchTypes.includes("teams")) {
      data["teams"] = await db.$queryRaw`
        SELECT id, name
        FROM "Team" 
        WHERE name % ${query} 
        ORDER BY name <-> ${query} ASC
        LIMIT 2;`;
    }

    res.send({ message: "Data searched", data });
  }
);

export default router;
