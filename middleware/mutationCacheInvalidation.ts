import type { NextFunction, Request, Response } from "express";

import { invalidatePublicReadCaches } from "../lib/cacheInvalidation.js";

export function mutationCacheInvalidation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!["POST", "PUT", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      invalidatePublicReadCaches("all");
    }
  });

  next();
}
