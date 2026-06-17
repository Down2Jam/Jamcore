import express from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import {
  getContentReviewSettings,
  listPendingReviewPosts,
} from "../../../../features/posts/index.js";

const router = express.Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("moderation:read"),
  asyncHandler(async (_req, res) => {
    res.json({
      settings: await getContentReviewSettings(res.locals.tenantId),
      pendingPosts: await listPendingReviewPosts(res.locals.tenantId),
    });
  }),
);

export default router;
