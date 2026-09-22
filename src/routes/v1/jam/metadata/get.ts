import { Router } from "express";

import { getCurrentActiveJamMetadata } from "@features/jams";
import { asyncHandler } from "@middleware/asyncHandler";
import rateLimit from "@middleware/rateLimit";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const activeJam = await getCurrentActiveJamMetadata(res.locals.tenantId);

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    res.json({
      message: "Current jam metadata fetched",
      data: {
        phase: activeJam.phase,
        jam: activeJam.jam ?? null,
        nextJam: activeJam.nextJam ?? null,
      },
    });
  }),
);

export default router;
