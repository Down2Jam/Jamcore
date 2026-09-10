import { Router } from "express";

import { listRecentAchievementUnlocks } from "@features/achievements";
import { asyncHandler } from "@middleware/asyncHandler";
import rateLimit from "@middleware/rateLimit";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const achievements = await listRecentAchievementUnlocks(res.locals.tenantId);

    res.json({
      message: "Recent achievements fetched",
      data: achievements,
    });
  }),
);

export default router;
