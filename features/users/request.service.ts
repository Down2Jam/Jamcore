import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import { NotFoundError } from "../../lib/errors.js";
import {
  requestUserDetailSelect,
  requestUserOptionalSelect,
} from "../../prisma/selects.js";
import type {
  OptionalRequestUserContext,
  RequestUserContext,
} from "../../types/user.js";
import {
  presentOptionalRequestUser,
  presentRequestUser,
} from "./request.presenters.js";

export async function loadRequestUserBySlug(
  userSlug: string,
  tenantId?: string | null,
): Promise<RequestUserContext | null> {
  const user = await db.user.findUnique({
    where: { slug: userSlug },
    select: requestUserDetailSelect,
  });

  if (user && tenantId) {
    await assertUserTenant(user.id, tenantId);
  }

  return user ? presentRequestUser(user) : null;
}

export async function loadRequestUserIdentityBySlug(userSlug: string) {
  return db.user.findUnique({
    where: { slug: userSlug },
    select: {
      id: true,
      slug: true,
      admin: true,
      mod: true,
    },
  });
}

export async function loadOptionalRequestUserBySlug(
  userSlug: string,
  tenantId?: string | null,
  ): Promise<OptionalRequestUserContext | null> {
  const user = await db.user.findUnique({
    where: { slug: userSlug },
    select: requestUserOptionalSelect,
  });

  if (user && tenantId) {
    await assertUserTenant(user.id, tenantId);
  }

  return user ? presentOptionalRequestUser(user) : null;
}

async function assertUserTenant(userId: number, tenantId?: string | null) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "User",
    entityId: userId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("User missing.");
  }
}
