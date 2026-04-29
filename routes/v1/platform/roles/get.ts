import { Router } from "express";
import { z } from "zod";

import { listRoleGrantsFromDb } from "../../../../infra/platformStore.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseQuery } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

const querySchema = z.object({
  subjectType: z.string().trim().optional(),
  subjectId: z.string().trim().optional(),
});

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, querySchema);
    res.json({
      message: "Role grants fetched",
      data: await listRoleGrantsFromDb({
        ...input,
        tenantId: res.locals.tenantId,
      }),
    });
  }),
);

export default router;
