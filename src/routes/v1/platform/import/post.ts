import { Router } from "express";

import { importTenantSnapshot, importTenantSnapshotSchema } from "../../../../features/platform/tenant-admin.service.js";
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
  requirePermission("imports:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, importTenantSnapshotSchema);
    const scopedInput = {
      ...input,
      snapshot: {
        ...input.snapshot,
        tenantId: res.locals.tenantId ?? input.snapshot.tenantId,
      },
    };
    const result = await importTenantSnapshot(scopedInput);
    await writeAuditEntry({
      action: scopedInput.mode === "apply" ? "tenant.import" : "tenant.import.validate",
      actor: res.locals.serviceAuth
        ? { type: "service", slug: res.locals.serviceAuth.name }
        : { type: "user", id: res.locals.user?.id, slug: res.locals.user?.slug },
      resource: `tenant:${res.locals.tenantId ?? scopedInput.snapshot.tenantId}`,
      metadata: {
        mode: scopedInput.mode,
      },
    });
    res.status(scopedInput.mode === "apply" ? 201 : 200).json({
      message:
        scopedInput.mode === "apply"
          ? "Tenant snapshot imported"
          : "Tenant snapshot validated",
      data: result,
    });
  }),
);

export default router;
