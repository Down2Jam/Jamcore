import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import logger from "@helper/logger";
import db from "@helper/db";

const router = Router();

/**
 * Route to get all jams from the database.
 */
router.get(
  "/",
  rateLimit(),

  async (_req, res) => {
    logger.info(`Jams fetched`);
    const jams = await db.jam.findMany({
      take: 10,
      orderBy: { id: "desc" },
    });

    const now = Date.now();

    const activeJams = jams.filter((jam) => {
      const jamEnd = new Date(jam.startTime).getTime();

      return jamEnd < now;
    });

    res.send(activeJams);
  }
);

export default router;
