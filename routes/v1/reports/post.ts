import express from "express";

import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { createReport, createReportSchema } from "@features/reports";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = express.Router();

router.post(
  "/",
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createReportSchema);
    const report = await createReport({
      actor: requireRequestUser(res),
      input,
      tenantId: res.locals.tenantId,
    });
    res.status(201).json(report);
  }),
);

export default router;
