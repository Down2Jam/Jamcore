import { Router } from "express";

import { listConfiguredServiceKeys } from "../../../../auth/service.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";

const router = Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("service-keys:read"),
  async (_req, res) => {
    res.json({
      message: "Service keys fetched",
      data: await listConfiguredServiceKeys(res.locals.tenantId),
    });
  },
);

export default router;
