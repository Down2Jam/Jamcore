import { Router } from "express";
import authUserOptional from "@middleware/authUserOptional";
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
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, getRecapVisibilityQuerySchema);
    const data = await getRecapVisibility({
      preview: input.preview === "1",
      userSlug: input.userSlug,
      jamId: input.jamId,
      jamSlug: input.jamSlug,
      viewer: res.locals.userSlug ? { slug: res.locals.userSlug } : null,
      tenantId: res.locals.tenantId,
    });

    return res.json({ data });
  }),
);

export default router;

