import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import { Router } from "express";

const router = Router();

router.get(
  "/",
  rateLimit(),

  async function (req, res) {
    const game = await db.$queryRaw`
      SELECT * FROM "Game"
      ORDER BY RANDOM()
      LIMIT 1
    `;

    res.json({ message: "Fetched random game", data: game[0] });
  }
);

export default router;
