import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

/**
 * Route to get the rating categories from the database.
 */
router.get(
  "/",
  rateLimit(),

  async (req, res) => {
    const { always } = req.query;
    const categories = await db.ratingCategory.findMany({
      where: {
        always: always == "true" ? true : false,
      },
      orderBy: [{ order: "desc" }, { id: "asc" }],
    });

    res.send({
      message: "Categories fetched",
      data: categories,
    });
  }
);

export default router;
