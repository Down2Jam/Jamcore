import express from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requireRequestUser } from "../../../../lib/locals.js";
import { parseBody } from "../../../../lib/request.js";
import {
  contentReviewSettingsSchema,
  reviewPendingPost,
  reviewPostSchema,
  updateContentReviewSettings,
} from "../../../../features/posts/index.js";

const router = express.Router();

router.put(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("moderation:write"),
  asyncHandler(async (req, res) => {
    const body = req.body as { decision?: unknown; postId?: unknown };
    const actor = requireRequestUser(res);
    const result =
      body.decision !== undefined || body.postId !== undefined
        ? await reviewPendingPost({
            actor,
            input: parseBody(req, reviewPostSchema),
            tenantId: res.locals.tenantId,
          })
        : await updateContentReviewSettings({
            actor,
            input: parseBody(req, contentReviewSettingsSchema),
            tenantId: res.locals.tenantId,
          });
    res.json(result);
  }),
);

export default router;
