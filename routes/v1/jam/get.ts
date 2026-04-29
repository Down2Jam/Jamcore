import { Router } from "express";

import { getCurrentActiveJam } from "@features/jams";
import { asyncHandler } from "@middleware/asyncHandler";
import rateLimit from "@middleware/rateLimit";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const activeJam = await getCurrentActiveJam(res.locals.tenantId);

    res.json({
      message: "Current jam fetched",
      data: {
        phase: activeJam.phase,
        jam: activeJam.jam ?? null,
        nextJam: activeJam.nextJam ?? null,
      },
    });
  }),
);

export default router;
