import { Router } from "express";

import {
  rotateServiceKey,
  rotateServiceKeySchema,
} from "../../../../auth/service.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { parseBody } from "../../../../lib/request.js";

const router = Router();

router.put(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("service-keys:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, rotateServiceKeySchema);
    const rotated = await rotateServiceKey({
      ...input,
      tenantId: res.locals.tenantId,
    });
    res.json({
      message: "Service key rotated",
      data: rotated,
    });
  }),
);

export default router;
