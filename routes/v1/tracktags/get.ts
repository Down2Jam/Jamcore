import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

router.get(
  "/",
  rateLimit(),
  async (_req, res) => {
    const tags = await db.trackTag.findMany({
      orderBy: [{ category: { priority: "desc" } }, { name: "asc" }],
      include: {
        category: true,
      },
    });

    res.send({
      message: "Track tags fetched",
      data: tags,
    });
  },
);

export default router;
