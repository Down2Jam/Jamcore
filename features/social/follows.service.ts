import { z } from "zod";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

type FollowActor = {
  id: number;
  slug: string;
  name?: string | null;
};

export const followUserBodySchema = z.object({
  follow: z.boolean().optional().default(true),
});

export async function followUserBySlug({
  actor,
  targetSlug,
  follow,
  tenantId,
}: {
  actor: FollowActor;
  targetSlug: string;
  follow: boolean;
  tenantId?: string | null;
}) {
  const target = await db.user.findUnique({
    where: { slug: targetSlug },
    select: { id: true },
  });
  if (!target) throw new NotFoundError("User not found");
  if (target.id === actor.id) throw new BadRequestError("Cannot follow yourself");
  const allowed = await filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: [target.id],
    tenantId,
  });
  if (!allowed.includes(target.id)) throw new NotFoundError("User not found");

  if (follow) {
    const existing = await db.userFollow.findUnique({
      where: { followerId_followingId: { followerId: actor.id, followingId: target.id } },
      select: { followerId: true },
    });
    await db.userFollow.upsert({
      where: { followerId_followingId: { followerId: actor.id, followingId: target.id } },
      create: {
        followerId: actor.id,
        followingId: target.id,
        tenantId: tenantId ?? null,
      },
      update: {
        tenantId: tenantId ?? null,
      },
    });
    if (!existing) {
      await db.notification.create({
        data: {
          recipientId: target.id,
          actorId: actor.id,
          type: "FOLLOW",
          title: `${actor.name ?? actor.slug} followed you`,
          body: "You have a new follower.",
          link: `/users/${actor.slug}`,
          data: { kind: "user_follow", followerId: actor.id },
        },
      });
    }
  } else {
    await db.userFollow.deleteMany({
      where: { followerId: actor.id, followingId: target.id },
    });
  }
  return { ok: true, following: follow };
}

export async function listFollowerIds({
  userId,
  tenantId,
}: {
  userId: number;
  tenantId?: string | null;
}) {
  const rows = await db.userFollow.findMany({
    where: {
      followingId: userId,
      tenantId: tenantId ?? null,
    },
    select: { followerId: true },
  });
  return rows.map((row) => row.followerId);
}

export async function notifyFollowers({
  authorId,
  tenantId,
  type,
  title,
  body,
  link,
  data,
}: {
  authorId: number;
  tenantId?: string | null;
  type: "GENERAL";
  title: string;
  body: string;
  link?: string;
  data?: unknown;
}) {
  const followerIds = await listFollowerIds({ userId: authorId, tenantId });
  if (followerIds.length === 0) return;
  await db.notification.createMany({
    data: followerIds
      .filter((recipientId) => recipientId !== authorId)
      .map((recipientId) => ({
        recipientId,
        actorId: authorId,
        type,
        title,
        body,
        link,
        data: data as object | undefined,
      })),
  });
}
