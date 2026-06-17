import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listTrackRatingCategories } from "@features/taxonomies";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const categories = await listTrackRatingCategories();

    res.send({
      message: "Track rating categories fetched",
      data: categories,
    });
  }),
);

export default router;
