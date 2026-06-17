import express from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { parseQuery } from "../../../../lib/request.js";
import {
  getModerationDashboard,
  moderationDashboardQuerySchema,
} from "../../../../features/platform/moderation-dashboard.service.js";

const router = express.Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("moderation:read"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, moderationDashboardQuerySchema);
    const result = await getModerationDashboard({
      tenantId: res.locals.tenantId,
      limit: input.limit,
    });
    res.json(result);
  }),
);

export default router;
