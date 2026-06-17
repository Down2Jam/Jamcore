import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listJams } from "@features/jams";

const router = Router();

/**
 * Route to get all jams from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const jams = await listJams(res.locals.tenantId);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    res.send(jams);
  }),
);

export default router;
