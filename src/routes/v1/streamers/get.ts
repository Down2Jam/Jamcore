import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listFeaturedStreamers } from "@features/streamers";

const router = Router();

/**
 * Route to get streamers from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const featuredStreamers = await listFeaturedStreamers();
    res.json({ message: "Fetched streamers", data: featuredStreamers });
  }),
);

export default router;
