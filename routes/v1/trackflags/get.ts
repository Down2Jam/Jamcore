import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

router.get("/", rateLimit(), async (_req, res) => {
  const flags = await db.trackFlag.findMany({
    orderBy: { name: "asc" },
  });

  res.send({
    message: "Track flags fetched",
    data: flags,
  });
});

export default router;
