import { z } from "zod";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { listFederationDeliveryRecords } from "../federation/transport/delivery.service.js";

export const moderationDashboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

async function filterTenantReports(reports: Array<{ id: number; userId: number | null; postId: number | null; commentId: number | null; gameId: number | null }>, tenantId?: string | null) {
  if (!tenantId) return reports;
  const [postIds, gameIds, userIds] = await Promise.all([
    filterCoreEntityIdsByTenant({
      entityType: "Post",
      ids: reports.map((report) => report.postId).filter((id): id is number => id != null),
      tenantId,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: reports.map((report) => report.gameId).filter((id): id is number => id != null),
      tenantId,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: reports.map((report) => report.userId).filter((id): id is number => id != null),
      tenantId,
    }),
  ]);
  const allowedPosts = new Set(postIds);
  const allowedGames = new Set(gameIds);
  const allowedUsers = new Set(userIds);

  return reports.filter((report) => {
    if (report.postId != null) return allowedPosts.has(report.postId);
    if (report.gameId != null) return allowedGames.has(report.gameId);
    if (report.userId != null) return allowedUsers.has(report.userId);
    return report.commentId != null;
  });
}

async function countVisiblePosts(where: Record<string, unknown>, tenantId?: string | null) {
  const posts = await db.post.findMany({
    where,
    select: { id: true },
    take: 500,
    orderBy: { id: "desc" },
  });
  const allowed = await filterCoreEntityIdsByTenant({
    entityType: "Post",
    ids: posts.map((post) => post.id),
    tenantId,
  });
  return allowed.length;
}

async function countScheduledPosts(tenantId?: string | null) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM "Post"
      WHERE draft_status = 'scheduled'
        AND "deletedAt" IS NULL
        AND "removedAt" IS NULL
      ORDER BY scheduled_publish_at ASC
      LIMIT 500
    `,
  )) as Array<{ id: number }>;
  const allowed = await filterCoreEntityIdsByTenant({
    entityType: "Post",
    ids: rows.map((row) => row.id),
    tenantId,
  });
  return allowed.length;
}

export async function getModerationDashboard({
  tenantId,
  limit = 25,
}: {
  tenantId?: string | null;
  limit?: number;
}) {
  const recentReports = await db.report.findMany({
    where: { resolved: false },
    include: {
      reporter: { select: { id: true, slug: true, name: true } },
      user: { select: { id: true, slug: true, name: true } },
      post: { select: { id: true, slug: true, title: true } },
      game: { select: { id: true, slug: true } },
      comment: { select: { id: true, postId: true, gameId: true, trackId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const tenantReports = await filterTenantReports(recentReports, tenantId);
  const deliveries = listFederationDeliveryRecords(100);

  return {
    counts: {
      unresolvedReports: tenantReports.length,
      removedPosts: await countVisiblePosts({ removedAt: { not: null } }, tenantId),
      deletedPosts: await countVisiblePosts({ deletedAt: { not: null } }, tenantId),
      scheduledPosts: await countScheduledPosts(tenantId),
      failedFederationDeliveries: deliveries.filter((delivery) => delivery.status === "failed").length,
      queuedFederationDeliveries: deliveries.filter((delivery) => delivery.status === "queued").length,
    },
    reports: tenantReports,
    federation: {
      deliveries: deliveries.slice(0, limit),
    },
  };
}
