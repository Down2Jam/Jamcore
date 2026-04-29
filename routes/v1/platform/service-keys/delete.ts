import { Router } from "express";

import {
  revokeServiceKey,
  revokeServiceKeySchema,
} from "../../../../auth/service.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { parseBody } from "../../../../lib/request.js";

const router = Router();

router.delete(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("service-keys:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, revokeServiceKeySchema);
    const revoked = await revokeServiceKey(input.id, res.locals.tenantId);
    res.json({
      message: "Service key revoked",
      data: revoked,
    });
  }),
);

export default router;
