import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";

import { createRoleGrantInDb } from "../../../../infra/platformStore.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";

const router = Router();

const bodySchema = z.object({
  subjectType: z.enum(["user", "service"]),
  subjectId: z.string().trim().min(1),
  role: z.string().trim().min(1),
  resourceType: z.string().trim().optional(),
  resourceId: z.string().trim().optional(),
});

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("roles:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, bodySchema);
    await createRoleGrantInDb({
      id: randomUUID(),
      ...input,
      tenantId: res.locals.tenantId,
    });
    res.status(201).json({
      message: "Role grant created",
    });
  }),
);

export default router;
