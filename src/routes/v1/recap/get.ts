import { Router } from "express";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@loaders/getUserOptional";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  getRecapVisibility,
  getRecapVisibilityQuerySchema,
} from "@features/recap";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

router.get(
  "/",
  rateLimit(),
  authUserOptional,
  getUserOptional,
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, getRecapVisibilityQuerySchema);
    const data = await getRecapVisibility({
      userSlug: input.userSlug,
      jamId: input.jamId,
      jamSlug: input.jamSlug,
      viewer: res.locals.user,
      tenantId: res.locals.tenantId,
    });

    return res.json({ data });
  }),
);

export default router;

