import express from "express";

import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { listReports, listReportsQuerySchema } from "@features/reports";
import { parseQuery } from "../../../../lib/request.js";

const router = express.Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("reports:read"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listReportsQuerySchema);
    res.json(await listReports({ input }));
  }),
);

export default router;
