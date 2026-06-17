import { Router } from "express";
import { z } from "zod";

import {
  getEventCheckpointFromDbForTenant,
  upsertEventCheckpointInDb,
} from "../../../../infra/platformStore.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

const bodySchema = z.object({
  consumerId: z.string().trim().min(1),
  lastEventId: z.string().trim().min(1).nullable().optional(),
  lastOccurredAt: z.string().datetime().nullable().optional(),
});

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("events.consume"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, bodySchema);
    await upsertEventCheckpointInDb({
      ...input,
      tenantId: res.locals.tenantId,
    });
    res.json({
      message: "Checkpoint stored",
      data: await getEventCheckpointFromDbForTenant(
        input.consumerId,
        res.locals.tenantId,
      ),
    });
  }),
);

export default router;
