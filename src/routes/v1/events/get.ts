import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listEvents, listEventsQuerySchema } from "@features/events";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

/**
 * Route to get a jam from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listEventsQuerySchema);
    const events = await listEvents(input);

    res.send({
      message: "Events fetched",
      data: events,
    });
  }),
);

export default router;
