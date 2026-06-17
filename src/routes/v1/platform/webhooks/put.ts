import { Router } from "express";
import { z } from "zod";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { updateWebhookSubscription } from "../../../../infra/webhooks.js";

const router = Router();

const updateWebhookSchema = z.object({
  id: z.string().trim().min(1),
  endpoint: z.string().url().optional(),
  events: z.array(z.string().trim().min(1)).min(1).optional(),
  secret: z.string().trim().min(1).nullable().optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  status: z.enum(["active", "paused"]).optional(),
});

router.put(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("webhooks:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, updateWebhookSchema);
    await updateWebhookSubscription({
      ...input,
      tenantId: res.locals.tenantId,
    });
    res.json({
      message: "Webhook subscription updated",
    });
  }),
);

export default router;
