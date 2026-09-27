import { Router } from "express";
import authUserOptional from "@middleware/authUserOptional";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  getRecapVisibility,
  getRecapVisibilityQuerySchema,
} from "@features/recap";
import { parseQuery } from "../../../lib/request.js";
import db from "@infra/db";

const router = Router();

router.get(
  "/",
  rateLimit(),
  authUserOptional,
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, getRecapVisibilityQuerySchema);
    const previewAdmin = input.preview === "1" && res.locals.userSlug && res.locals.authMethod === "session"
      ? await db.user.findUnique({
          where: { slug: res.locals.userSlug },
          select: { admin: true },
        })
      : null;
    const viewer = res.locals.userSlug
      ? { slug: res.locals.userSlug, admin: previewAdmin?.admin === true }
      : null;
    const data = await getRecapVisibility({
      preview: input.preview === "1",
      userSlug: input.userSlug,
      jamId: input.jamId,
      jamSlug: input.jamSlug,
      viewer,
      tenantId: res.locals.tenantId,
    });

    return res.json({ data });
  }),
);

export default router;

