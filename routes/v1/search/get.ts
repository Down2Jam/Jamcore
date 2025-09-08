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

    if (searchTypes.includes("games")) {
      data["games"] = await db.$queryRaw`
        SELECT id, name, slug, banner, thumbnail, short
        FROM "Game" 
        WHERE published = true
          AND name % ${query} 
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
        SELECT 
          t.id,
          t.name,
          t."createdAt",
          t."updatedAt",
          json_build_object(
            'id', g.id,
            'name', g.name,
            'slug', g.slug,
            'thumbnail', g.thumbnail,
            'banner', g.banner,
            'short', g.short
          ) AS game,
          json_build_object(
            'id', u.id,
            'name', u.name,
            'slug', u.slug,
            'profilePicture', u."profilePicture",
            'bannerPicture', u."bannerPicture"
          ) AS composer
        FROM "Track" t
        JOIN "Game" g ON g.id = t."gameId"
        LEFT JOIN "User" u ON u.id = t."composerId"
        WHERE g.published = true
          AND t.name % ${query}
        ORDER BY t.name <-> ${query} ASC
        LIMIT 2;
      `;
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
