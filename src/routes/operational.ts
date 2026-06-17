import express from "express";

import db from "../infra/db.js";
import { renderMetrics } from "../infra/metrics.js";
import getUserOptional from "../loaders/getUserOptional.js";
import authUserOptional from "../middleware/authUserOptional.js";
import { authServiceOptional } from "../middleware/authServiceOptional.js";
import { requirePolicy } from "../middleware/requirePolicy.js";
import { runReadinessChecks } from "../runtime/readiness.js";

export function createOperationalRouter() {
  const router = express.Router();

  router.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok" });
  });

  router.get("/readyz", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      const readiness = await runReadinessChecks();
      if (!readiness.ok) {
        res.status(503).json({
          status: "degraded",
          checks: readiness.checks,
        });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({ status: "ready", checks: readiness.checks });
    } catch {
      res.status(503).json({
        status: "degraded",
        message: "Database not ready",
      });
    }
  });

  router.get(
    "/metrics",
    authServiceOptional,
    authUserOptional,
    getUserOptional,
    requirePolicy("platform.read"),
    async (_req, res) => {
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(await renderMetrics());
    },
  );

  return router;
}
