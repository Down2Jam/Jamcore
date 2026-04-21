import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import { Router } from "express";

const router = Router();

router.get("/", rateLimit(), async function (_req, res) {
  try {
    const game = await db.$queryRaw<{ id: number; name: string }[]>`
        WITH active_jams AS (
          SELECT j.id
          FROM "Jam" j
          WHERE NOW() >= j."startTime"
            AND NOW() < j."startTime"
              + (COALESCE(j."jammingHours", 0)
                 + COALESCE(j."submissionHours", 0)
                 + COALESCE(j."ratingHours", 0)) * INTERVAL '1 hour'
        )
        SELECT g.*
        FROM "Game" g
        WHERE g."published" = TRUE
          AND (
            NOT EXISTS (SELECT 1 FROM active_jams)
            OR g."jamId" IN (SELECT id FROM active_jams)
          )
        ORDER BY RANDOM()
        LIMIT 1
      `;

    res.json({
      message:
        "Fetched random published game (active jam if exists, else any game)",
      data: game[0] ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching random game" });
  }
});

export default router;
