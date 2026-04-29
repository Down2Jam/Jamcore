import express from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { parseBody } from "../../../../lib/request.js";
import {
  manageRadio,
  radioAdminActionSchema,
} from "../../../../features/radio/index.js";

const router = express.Router();

router.put(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("radio:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, radioAdminActionSchema);
    const result = await manageRadio({
      tenantId: res.locals.tenantId,
      actor: res.locals.user,
      input,
    });
    res.json(result);
  }),
);

export default router;
