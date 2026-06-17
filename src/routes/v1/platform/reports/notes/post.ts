import express from "express";

import getUserOptional from "../../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../../middleware/requirePolicy.js";
import { requireRequestUser } from "../../../../../lib/locals.js";
import { parseBody, parseQuery } from "../../../../../lib/request.js";
import { addReportNote, reportNoteSchema, reportParamsSchema } from "@features/reports";

const router = express.Router();

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("reports:write"),
  asyncHandler(async (req, res) => {
    const { id } = parseQuery(req, reportParamsSchema);
    const input = parseBody(req, reportNoteSchema);
    res.status(201).json(await addReportNote({
      reportId: id,
      actor: requireRequestUser(res),
      input,
    }));
  }),
);

export default router;
