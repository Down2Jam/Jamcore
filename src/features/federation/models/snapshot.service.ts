import { appConfig } from "../../../config/app.js";
import {
  countCoreEntitiesByTenant,
  doesCoreEntityBelongToTenant,
  filterCoreEntityIdsByTenant,
} from "../../../infra/coreTenantStore.js";
import db from "../../../infra/db.js";
import { NotFoundError } from "../../../lib/errors.js";

export async function getFederationJamSnapshot(tenantId?: string | null) {
  const jams = await db.jam.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      startTime: "desc",
    },
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      startTime: true,
    },
  });

  const allowedJamIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Jam",
      ids: jams.map((jam) => jam.id),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  );

  return jams.find((jam) => allowedJamIds.has(jam.id)) ?? null;
}

export async function getFederationUserBySlug(
  slug: string,
  tenantId?: string | null,
) {
  const user = await db.user.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      short: true,
      profilePicture: true,
      bannerPicture: true,
    },
  });

  if (!user) {
    throw new NotFoundError("Federated user not found");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "User",
    entityId: user.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Federated user not found");
  }

  return user;
}

export async function getFederationStats(tenantId?: string | null) {
  const totalUsers = tenantId
    ? await countCoreEntitiesByTenant({
        entityType: "User",
        tenantId,
        strictIsolation: appConfig.platform.multiTenant.strictIsolation,
      })
    : await db.user.count();

  return {
    totalUsers,
  };
}
