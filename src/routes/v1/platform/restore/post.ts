import { Router } from "express";

import { restoreTenantResource, restoreTenantResourceSchema } from "../../../../features/platform/tenant-admin.service.js";
import { writeAuditEntry } from "../../../../infra/audit.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("restore:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, restoreTenantResourceSchema);
    const data = await restoreTenantResource(input, res.locals.tenantId);
    await writeAuditEntry({
      action: "tenant.restore",
      actor: res.locals.serviceAuth
        ? { type: "service", slug: res.locals.serviceAuth.name }
        : { type: "user", id: res.locals.user?.id, slug: res.locals.user?.slug },
      resource: `${input.resourceType}:${input.resourceId}`,
    });
    res.json({
      message: "Tenant resource restored",
      data,
    });
  }),
);

export default router;
