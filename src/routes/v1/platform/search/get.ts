import { Router } from "express";
import { z } from "zod";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { listSearchAdminState } from "../../../../features/search/admin.service.js";
import { listSearchDocumentsByEntity } from "../../../../infra/searchStore.js";
import { parseQuery } from "../../../../lib/request.js";

const router = Router();
const querySchema = z.object({
  mode: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.enum(["state", "documents"]).optional(),
    )
    .optional(),
  entityType: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.enum(["game", "user", "post", "track", "team"]).optional(),
    )
    .optional(),
  entityId: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.coerce.number().int().positive().optional(),
    )
    .optional(),
  limit: z
    .preprocess(
      (value) => (Array.isArray(value) ? value[0] : value),
      z.coerce.number().int().min(1).max(200).optional(),
    )
    .optional(),
});

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("search:read"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, querySchema);
    if (input.mode === "documents") {
      res.json({
        message: "Search documents fetched",
        data: await listSearchDocumentsByEntity({
          tenantId: res.locals.tenantId,
          entityType: input.entityType,
          entityId: input.entityId,
          limit: input.limit ?? 100,
        }),
      });
      return;
    }

    res.json({
      message: "Search admin state fetched",
      data: await listSearchAdminState(res.locals.tenantId),
    });
  }),
);

export default router;
