import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { listSiteThemesWithUsage } from "@features/site-themes/usage.service";

const router = Router();

/**
 * Route to set the site themes
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const result = await listSiteThemesWithUsage(res.locals.tenantId);

    res.send({ message: "Themes fetched", data: result });
  }),
);

export default router;
