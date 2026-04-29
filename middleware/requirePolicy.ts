import type { NextFunction, Request, Response } from "express";

import { loadAuthorizationGrants } from "./authorizationContext.js";
import { ForbiddenError } from "../lib/errors.js";
import {
  evaluatePolicy,
  type PolicyName,
} from "../lib/policyEngine.js";

export function requirePolicy(policy: PolicyName) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    const grants = await loadAuthorizationGrants(res);

    if (
      evaluatePolicy({
        grants,
        policy,
        service: res.locals.serviceAuth,
        user: res.locals.user,
      })
    ) {
      next();
      return;
    }

    next(new ForbiddenError(`Policy denied: ${policy}`));
  };
}
