import { Router } from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import {
  listWebhookSubscriptions,
  listWebhookSubscriptionsForTenant,
  loadRecentWebhookDeliveries,
} from "../../../../infra/webhooks.js";

const router = Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("webhooks:read"),
  async (req, res, next) => {
    try {
      const mode = req.query.mode === "subscriptions" ? "subscriptions" : "deliveries";
      const data =
        mode === "subscriptions"
          ? await listWebhookSubscriptionsForTenant(res.locals.tenantId)
          : await loadRecentWebhookDeliveries();
      res.json({
        message:
          mode === "subscriptions"
            ? "Webhook subscriptions fetched"
            : "Webhook deliveries fetched",
        data,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
