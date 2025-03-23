import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

/**
 * Route to get the flags from the database.
 */
router.get(
  "/",
  rateLimit(),

  async (_req, res) => {
    const flags = await db.flag.findMany({});

    res.send({
      message: "Flags fetched",
      data: flags,
    });
  }
);

export default router;
