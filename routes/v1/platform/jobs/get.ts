import { Router } from "express";

import { listJobs } from "../../../../infra/jobQueue.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";

const router = Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("jobs:read"),
  async (_req, res) => {
    res.json({
      message: "Jobs fetched",
      data: await listJobs(),
    });
  },
);

export default router;
