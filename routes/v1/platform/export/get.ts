import { Router } from "express";
import { z } from "zod";

import { exportTenantSnapshot } from "../../../../features/platform/tenant-admin.service.js";
import { writeAuditEntry } from "../../../../infra/audit.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { ForbiddenError } from "../../../../lib/errors.js";
import { hasPermission } from "../../../../lib/permissions.js";
import { parseQuery } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { loadAuthorizationGrants } from "../../../../middleware/authorizationContext.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

const querySchema = z.object({
  includeSecrets: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.union([z.literal("true"), z.literal("false")]).optional(),
    )
    .optional(),
});

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("exports:read"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, querySchema);
    const includeSecrets = input.includeSecrets === "true";
    if (includeSecrets) {
      const grants = await loadAuthorizationGrants(res);
      if (
        !hasPermission({
          grants,
          permission: "exports:secrets:read",
          service: res.locals.serviceAuth,
          user: res.locals.user,
        })
      ) {
        throw new ForbiddenError("Missing permission: exports:secrets:read");
      }
    }

    const data = await exportTenantSnapshot({
      tenantId: res.locals.tenantId,
      includeSecrets,
    });
    await writeAuditEntry({
      action: "tenant.export",
      actor: res.locals.serviceAuth
        ? { type: "service", slug: res.locals.serviceAuth.name }
        : { type: "user", id: res.locals.user?.id, slug: res.locals.user?.slug },
      resource: `tenant:${res.locals.tenantId ?? "default"}`,
      metadata: {
        includeSecrets,
      },
    });
    res.json({
      message: "Tenant snapshot exported",
      data,
    });
  }),
);

export default router;
