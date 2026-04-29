import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { createWebhookSubscription } from "../../../../infra/webhooks.js";

const router = Router();

const createWebhookSchema = z.object({
  endpoint: z.string().url(),
  events: z.array(z.string().trim().min(1)).min(1),
  secret: z.string().trim().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("webhooks:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createWebhookSchema);
    const created = await createWebhookSubscription({
      ...input,
      tenantId: res.locals.tenantId,
    });
    res.status(201).json({
      message: "Webhook subscription created",
      data: created,
    });
  }),
);

export default router;
