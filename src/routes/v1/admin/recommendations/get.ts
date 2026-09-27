import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { ForbiddenError } from "../../../../lib/errors.js";
import { parseQuery } from "../../../../lib/request.js";
import {
  previewRecommendedGames,
  recommendationPreviewQuerySchema,
} from "../../../../features/games/listing.service.js";

const router = Router();

router.get(
  "/",
  rateLimit(20),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    if (!res.locals.user?.admin) throw new ForbiddenError("Admin only.");

    const query = parseQuery(req, recommendationPreviewQuerySchema);
    const result = await previewRecommendedGames({
      viewerId: query.userId ?? res.locals.user.id,
      jamId: query.jamId,
      pageVersion: query.pageVersion,
      offset: query.offset,
      limit: query.limit,
      tenantId: res.locals.tenantId,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  }),
);

export default router;
