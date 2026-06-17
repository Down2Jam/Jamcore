import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { listSiteThemes } from "@features/site-themes";

const router = Router();

/**
 * Route to set the site themes
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const result = await listSiteThemes();

    res.send({ message: "Themes fetched", data: result });
  }),
);

export default router;
