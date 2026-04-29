import { Router } from "express";
import { z } from "zod";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { deleteWebhookSubscription } from "../../../../infra/webhooks.js";

const router = Router();

const deleteWebhookSchema = z.object({
  id: z.string().trim().min(1),
});

router.delete(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("webhooks:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, deleteWebhookSchema);
    await deleteWebhookSubscription(input.id, res.locals.tenantId);
    res.json({
      message: "Webhook subscription deleted",
    });
  }),
);

export default router;
