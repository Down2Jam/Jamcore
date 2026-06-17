import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listGameTags } from "@features/taxonomies";

const router = Router();

/**
 * Route to get the game tags from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const tags = await listGameTags();

    res.send({
      message: "Tags fetched",
      data: tags,
    });
  }),
);

export default router;
