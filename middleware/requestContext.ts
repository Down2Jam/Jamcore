import { randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { resolveTenantConfig } from "../config/tenant.js";
import logger from "../infra/logger.js";
import { recordHttpRequest } from "../infra/metrics.js";

const SLOW_REQUEST_MS = 1000;

function getRouteLabel(req: Request) {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl || ""}${routePath || ""}` || req.path;
  }

  return req.path;
}

export function requestContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId =
    typeof req.headers["x-request-id"] === "string" &&
    req.headers["x-request-id"].trim().length > 0
      ? req.headers["x-request-id"]
      : randomUUID();

  res.locals.requestId = requestId;
  res.locals.cspNonce = randomBytes(16).toString("base64");
  res.locals.requestStartedAt = Date.now();
  res.locals.tenant = resolveTenantConfig(req.hostname);
  res.locals.tenantId = res.locals.tenant.id;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Tenant-Id", res.locals.tenantId);

  res.on("finish", () => {
    const startedAt = res.locals.requestStartedAt ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const route = getRouteLabel(req);

    recordHttpRequest({
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs,
    });

    logger.info("HTTP request completed", {
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs,
      ...(res.statusCode >= 500 || durationMs >= SLOW_REQUEST_MS
        ? { requestId }
        : {}),
    });
  });

  next();
}
