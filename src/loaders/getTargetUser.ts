import type { NextFunction, Request, Response } from "express";

import { appConfig } from "../config/app.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";
import { loadTargetUserContext } from "../features/users/index.js";

async function getTargetUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const explicitTargetUserIdValue =
    req.body?.targetUserId ??
    req.query?.targetUserId ??
    req.params?.targetUserId;
  const explicitTargetUserSlug =
    req.body?.targetUserSlug ??
    req.query?.targetUserSlug ??
    req.params?.userSlug ??
    req.params?.targetUserSlug;
  const targetUserIdValue =
    explicitTargetUserIdValue ??
    (explicitTargetUserSlug ? undefined : res.locals.user?.id);
  const targetUserSlug = explicitTargetUserSlug ?? res.locals.user?.slug;

  const targetUserId =
    typeof targetUserIdValue === "string"
      ? Number.parseInt(targetUserIdValue, 10)
      : targetUserIdValue;

  if (!targetUserId && !targetUserSlug) {
    next(new BadRequestError("User id or slug missing."));
    return;
  }

  const targetUser = await loadTargetUserContext({
    targetUserId: Number.isInteger(targetUserId) ? targetUserId : undefined,
    targetUserSlug:
      typeof targetUserSlug === "string" && targetUserSlug.trim().length > 0
        ? targetUserSlug
        : undefined,
  });

  if (!targetUser) {
    next(new NotFoundError("User missing."));
    return;
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "User",
    entityId: targetUser.id,
    tenantId: res.locals.tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    next(new NotFoundError("User missing."));
    return;
  }

  res.locals.targetUser = targetUser;
  next();
}

export default getTargetUser;
