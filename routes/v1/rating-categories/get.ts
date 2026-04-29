import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  listRatingCategories,
  ratingCategoriesQuerySchema,
} from "@features/taxonomies";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

/**
 * Route to get the rating categories from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, ratingCategoriesQuerySchema);
    const categories = await listRatingCategories(input);

    res.send({
      message: "Categories fetched",
      data: categories,
    });
  }),
);

export default router;
