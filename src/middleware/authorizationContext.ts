import type { NextFunction, Request, Response } from "express";

import { listRoleGrantsFromDb } from "../infra/platformStore.js";

function getAuthorizationContextKey(res: Response) {
  return JSON.stringify({
    service: res.locals.serviceAuth?.name ?? null,
    user: res.locals.user?.id ?? null,
    tenantId: res.locals.tenantId ?? null,
  });
}

export async function loadAuthorizationGrants(res: Response) {
  const contextKey = getAuthorizationContextKey(res);
  if (res.locals.authorizationGrantsContextKey === contextKey) {
    return res.locals.authorizationGrants ?? [];
  }

  const grants = [
    ...(res.locals.user?.id
      ? await listRoleGrantsFromDb({
          subjectType: "user",
          subjectId: String(res.locals.user.id),
          tenantId: res.locals.tenantId,
        })
      : []),
    ...(res.locals.serviceAuth?.name
      ? await listRoleGrantsFromDb({
          subjectType: "service",
          subjectId: res.locals.serviceAuth.name,
          tenantId: res.locals.tenantId,
        })
      : []),
  ];

  res.locals.authorizationGrants = grants;
  res.locals.authorizationGrantsContextKey = contextKey;
  return grants;
}

export async function authorizationContext(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  await loadAuthorizationGrants(res);
  next();
}
