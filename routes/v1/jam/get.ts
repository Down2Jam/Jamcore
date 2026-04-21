import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import logger from "@helper/logger";
import getJam from "@middleware/getJam";

const router = Router();

/**
 * Route to get a jam from the database.
 */
router.get(
  "/",
  rateLimit(),

  getJam,

  async (_req, res) => {
    // if no jam found it crashes the container
    res.locals.jam && logger.info(`Jam with id ${res.locals.jam.id} fetched`);
    res.send({
      message: "Jam fetched",
      data: {
        jam: res.locals.jam,
        nextJam: res.locals.nextJam ?? null,
        phase: res.locals.jamPhase,
      },
    });
  }
);

export default router;
