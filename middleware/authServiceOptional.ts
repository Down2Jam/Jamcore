import type { NextFunction, Request, Response } from "express";

import { authenticateServiceRequest } from "../auth/service.js";
import { ForbiddenError } from "../lib/errors.js";

export async function authServiceOptional(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const service = await authenticateServiceRequest(req);
    if (service) {
      if (
        service.tenantId &&
        res.locals.tenantId &&
        service.tenantId !== res.locals.tenantId
      ) {
        throw new ForbiddenError("Service key is not allowed for this tenant");
      }
      res.locals.serviceAuth = service;
    }
    next();
  } catch (error) {
    next(error);
  }
}
