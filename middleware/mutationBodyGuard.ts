import type { NextFunction, Request, Response } from "express";

import bytes from "bytes";

import { appConfig } from "../config/app.js";
import { BadRequestError } from "../lib/errors.js";

const mutationBodyLimitBytes =
  typeof bytes.parse === "function"
    ? (bytes.parse(appConfig.api.limits.mutationBody) ?? 256 * 1024)
    : 256 * 1024;

export function mutationBodyGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!["POST", "PUT", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const rawSize = Buffer.byteLength(req.rawBody ?? "", "utf8");
  if (rawSize > mutationBodyLimitBytes) {
    next(new BadRequestError("Mutation body exceeds configured size limit"));
    return;
  }

  next();
}
