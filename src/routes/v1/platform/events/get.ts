import { Router } from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import {
  listRecentDomainEvents,
  listPersistedDomainEvents,
  registerDomainEventListener,
} from "../../../../lib/domainEvents.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("events.consume"),
  requirePermission("events:read"),
  async (req, res) => {
    const wantsStream =
      req.query.stream === "true" || req.header("accept") === "text/event-stream";
    const limit =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
    const after = typeof req.query.after === "string" ? req.query.after : undefined;

    if (!wantsStream) {
      res.json({
        message: "Events fetched",
        data:
          after || limit
            ? await listPersistedDomainEvents({
                after,
                limit,
                tenantId: res.locals.tenantId,
              })
            : listRecentDomainEvents(),
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const writeEvent = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    listRecentDomainEvents(10).reverse().forEach(writeEvent);
    const dispose = registerDomainEventListener((event) => {
      writeEvent(event);
    });

    req.on("close", () => {
      dispose();
      res.end();
    });
  },
);

export default router;
