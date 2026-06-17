import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import getJam from "@loaders/getJam";
import { asyncHandler } from "@middleware/asyncHandler";
import { getTopThemeForJam } from "@features/themes";
import { requireLoadedJam } from "@lib/locals";

const router = Router();

/**
 * Route to get the top theme from the database
 */
router.get(
  "/",
  rateLimit(),

  getJam,
  asyncHandler(async (_req, res) => {
    const jam = requireLoadedJam(res);
    const theme = await getTopThemeForJam(jam.id);
    res.send({ message: "Theme fetched", data: theme });
  }),
);

export default router;

