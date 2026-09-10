import { Router } from "express";

import { listRecentTopScores } from "@features/scores";
import { asyncHandler } from "@middleware/asyncHandler";
import rateLimit from "@middleware/rateLimit";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const scores = await listRecentTopScores(res.locals.tenantId);
    res.json({ message: "Recent top scores fetched", data: scores });
  }),
);

export default router;
