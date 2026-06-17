import { Router } from "express";
import { z } from "zod";

import {
  deleteJobInDb,
  getJobByIdFromDb,
  retryJobInDb,
} from "../../../../infra/platformStore.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { NotFoundError } from "../../../../lib/errors.js";

const router = Router();

const bodySchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["retry", "delete"]),
});

router.put(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("jobs:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, bodySchema);
    const job = await getJobByIdFromDb(input.id, res.locals.tenantId);
    if (!job) {
      throw new NotFoundError("Job not found");
    }

    if (input.action === "retry") {
      await retryJobInDb(input.id, res.locals.tenantId);
    } else {
      await deleteJobInDb(input.id, res.locals.tenantId);
    }

    res.json({
      message: `Job ${input.action} queued`,
    });
  }),
);

export default router;
