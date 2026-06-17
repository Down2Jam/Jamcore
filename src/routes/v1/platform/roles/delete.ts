import { Router } from "express";
import { z } from "zod";

import { deleteRoleGrantInDb } from "../../../../infra/platformStore.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";

const router = Router();

const bodySchema = z.object({
  id: z.string().trim().min(1),
});

router.delete(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("roles:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, bodySchema);
    await deleteRoleGrantInDb(input.id, res.locals.tenantId);
    res.json({
      message: "Role grant deleted",
    });
  }),
);

export default router;
