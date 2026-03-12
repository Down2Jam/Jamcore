import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

router.get("/", rateLimit(), async (_req, res) => {
  const categories = await db.trackRatingCategory.findMany({
    orderBy: [{ order: "desc" }, { id: "asc" }],
  });

  res.send({
    message: "Track rating categories fetched",
    data: categories,
  });
});

export default router;
