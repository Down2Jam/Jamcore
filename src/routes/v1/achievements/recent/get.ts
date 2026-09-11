import { Router } from "express";
import { z } from "zod";

import { listRecentAchievementUnlocks } from "@features/achievements";
import { parseQuery } from "@lib/request";
import { asyncHandler } from "@middleware/asyncHandler";
import rateLimit from "@middleware/rateLimit";

const router = Router();
const querySchema = z.object({
  jamId: z.coerce.number().int().positive().optional(),
});

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const { jamId } = parseQuery(req, querySchema);
    const achievements = await listRecentAchievementUnlocks(
      res.locals.tenantId,
      undefined,
      jamId,
    );

    res.json({
      message: "Recent achievements fetched",
      data: achievements,
    });
  }),
);

export default router;
