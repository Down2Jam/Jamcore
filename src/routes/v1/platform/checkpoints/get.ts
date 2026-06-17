import { Router } from "express";
import { z } from "zod";

import { getEventCheckpointFromDbForTenant } from "../../../../infra/platformStore.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseQuery } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

const querySchema = z.object({
  consumerId: z.string().trim().min(1),
});

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("events.consume"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, querySchema);
    res.json({
      message: "Checkpoint fetched",
      data: await getEventCheckpointFromDbForTenant(
        input.consumerId,
        res.locals.tenantId,
      ),
    });
  }),
);

export default router;
