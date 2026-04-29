import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";

import { appConfig } from "../../../../config/app.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";

const router = Router();

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.read"),
  requirePermission("audit:read"),
  async (_req, res, next) => {
    try {
      const auditPath = path.resolve(process.cwd(), appConfig.platform.auditLogPath);
      const raw = await fs.readFile(auditPath, "utf8").catch(() => "");
      const entries = raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-100)
        .map((line) => JSON.parse(line));
      res.json({
        message: "Audit log fetched",
        data: entries.reverse(),
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
