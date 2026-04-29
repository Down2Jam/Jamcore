import type { NextFunction, Request, Response } from "express";

import { incrementRateLimit } from "../infra/rateLimitStore.js";
import { buildErrorEnvelope } from "../lib/apiResponse.js";

const DEFAULT_WINDOW_MS = 60_000;

function buildRateLimitKey(req: Request) {
  const routePath = typeof req.route?.path === "string" ? req.route.path : req.path;
  const route = `${req.baseUrl}${routePath === "/" ? "" : routePath}`;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ratelimit:${req.method}:${route}:${ip}`;
}

function rateLimit(limit = 30, windowMs = DEFAULT_WINDOW_MS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.method === "OPTIONS") {
        next();
        return;
      }

      const key = buildRateLimitKey(req);
      const { count, resetMs } = await incrementRateLimit(key, windowMs);
      const remaining = Math.max(0, limit - count);
      const resetAtEpochSeconds = Math.ceil((Date.now() + resetMs) / 1000);

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(resetAtEpochSeconds));
      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(remaining));
      res.setHeader("RateLimit-Reset", String(Math.ceil(resetMs / 1000)));
      res.setHeader("RateLimit-Policy", `${limit};w=${Math.ceil(windowMs / 1000)}`);

      if (count > limit) {
        res.setHeader("Retry-After", String(Math.ceil(resetMs / 1000)));
        res.status(429).json(
          buildErrorEnvelope({
            code: "RateLimitExceeded",
            message: "Too many requests, please try again later",
            requestId: res.locals.requestId,
          }),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export default rateLimit;
