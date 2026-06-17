import type { NextFunction, Request, Response } from "express";

import { loadAuthorizationGrants } from "./authorizationContext.js";
import type { Permission } from "../lib/permissions.js";
import { ForbiddenError } from "../lib/errors.js";
import { hasPermission } from "../lib/permissions.js";

export function requirePermission(permission: Permission) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const grants = await loadAuthorizationGrants(res);

    if (
      hasPermission({
        grants,
        permission,
        service: res.locals.serviceAuth,
        user: res.locals.user,
      })
    ) {
      next();
      return;
    }

    next(new ForbiddenError(`Missing permission: ${permission}`));
  };
}
