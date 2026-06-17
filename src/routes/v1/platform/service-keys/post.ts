import { Router } from "express";

import {
  createServiceKey,
  createServiceKeySchema,
} from "../../../../auth/service.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { parseBody } from "../../../../lib/request.js";

const router = Router();

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("service-keys:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createServiceKeySchema);
    const created = await createServiceKey(input);
    res.status(201).json({
      message: "Service key created",
      data: created,
    });
  }),
);

export default router;
