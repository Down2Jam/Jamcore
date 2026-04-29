import express from "express";
import { z } from "zod";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { parseBody } from "../../../../lib/request.js";
import {
  deleteFederationAllowlistEntry,
  deleteFederationBlock,
  deleteFederationBlockSchema,
} from "../../../../features/federation/admin.service.js";

const router = express.Router();

router.delete(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("federation:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, deleteFederationBlockSchema.extend({
      kind: z.enum(["block", "allowlist"]).optional().default("block"),
    }));
    const result = input.kind === "allowlist"
      ? await deleteFederationAllowlistEntry(input.id, res.locals.tenantId)
      : await deleteFederationBlock(input.id, res.locals.tenantId);
    res.json(result);
  }),
);

export default router;
