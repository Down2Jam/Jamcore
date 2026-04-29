import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listFlags } from "@features/taxonomies";

const router = Router();

/**
 * Route to get the flags from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const flags = await listFlags();

    res.send({
      message: "Flags fetched",
      data: flags,
    });
  }),
);

export default router;
