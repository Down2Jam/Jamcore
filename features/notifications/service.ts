import { z } from "zod";

import db from "../../infra/db.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { isAdmin, isModerator } from "../../domain/userPolicies.js";

export const deleteNotificationParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listNotificationsQuerySchema = z.object({
  status: z.enum(["all", "unread", "read", "archived"]).optional().default("all"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().datetime().optional(),
});

export const notificationIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const notificationPreferencesSchema = z.object({
  mutedTypes: z.array(z.string().trim().min(1)).optional().default([]),
  emailEnabled: z.boolean().optional().default(false),
});

type NotificationActor = {
  id: number;
  mod?: boolean | null;
  admin?: boolean | null;
};

export async function deleteNotificationById({
  notificationId,
  actor,
}: {
  notificationId: number;
  actor: NotificationActor;
}) {
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new NotFoundError("Notification not found");
  }

  const isOwner = notification.recipientId === actor.id;
  const canDelete = isOwner || isModerator(actor) || isAdmin(actor);

  if (!canDelete) {
    throw new ForbiddenError("Not allowed");
  }

  await db.notification.delete({
    where: { id: notificationId },
  });
}

function notificationStatusWhere(status: "all" | "unread" | "read" | "archived") {
  switch (status) {
    case "unread":
      return { readAt: null, archivedAt: null };
    case "read":
      return { readAt: { not: null }, archivedAt: null };
    case "archived":
      return { archivedAt: { not: null } };
    case "all":
    default:
      return {};
  }
}

export async function listNotifications({
  actor,
  input,
}: {
  actor: NotificationActor;
  input: z.infer<typeof listNotificationsQuerySchema>;
}) {
  const notifications = await db.$queryRawUnsafe(
    `
      SELECT *
      FROM "Notification"
      WHERE "recipientId" = $1
        AND ($2::text <> 'unread' OR (read_at IS NULL AND archived_at IS NULL))
        AND ($2::text <> 'read' OR (read_at IS NOT NULL AND archived_at IS NULL))
        AND ($2::text <> 'archived' OR archived_at IS NOT NULL)
        AND ($4::timestamptz IS NULL OR "createdAt" < $4::timestamptz)
      ORDER BY "createdAt" DESC
      LIMIT $3
    `,
    actor.id,
    input.status,
    input.limit,
    input.cursor ?? null,
  );
  const unreadRows = (await db.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS count
      FROM "Notification"
      WHERE "recipientId" = $1 AND read_at IS NULL AND archived_at IS NULL
    `,
    actor.id,
  )) as Array<{ count: number }>;
  return {
    items: notifications,
    unreadCount: Number(unreadRows[0]?.count ?? 0),
  };
}

async function assertNotificationOwner(notificationId: number, actor: NotificationActor) {
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, recipientId: true },
  });
  if (!notification) throw new NotFoundError("Notification not found");
  if (notification.recipientId !== actor.id && !isModerator(actor) && !isAdmin(actor)) {
    throw new ForbiddenError("Not allowed");
  }
  return notification;
}

export async function markNotificationRead({
  notificationId,
  actor,
  read = true,
}: {
  notificationId: number;
  actor: NotificationActor;
  read?: boolean;
}) {
  await assertNotificationOwner(notificationId, actor);
  await db.$executeRawUnsafe(
    `UPDATE "Notification" SET read_at = $2::timestamptz WHERE id = $1`,
    notificationId,
    read ? new Date().toISOString() : null,
  );
  return db.notification.findUnique({ where: { id: notificationId } });
}

export async function archiveNotification({
  notificationId,
  actor,
}: {
  notificationId: number;
  actor: NotificationActor;
}) {
  await assertNotificationOwner(notificationId, actor);
  await db.$executeRawUnsafe(
    `UPDATE "Notification" SET archived_at = NOW(), read_at = NOW() WHERE id = $1`,
    notificationId,
  );
  return db.notification.findUnique({ where: { id: notificationId } });
}

export async function markAllNotificationsRead(actor: NotificationActor) {
  await db.$executeRawUnsafe(
    `UPDATE "Notification" SET read_at = NOW() WHERE "recipientId" = $1 AND archived_at IS NULL AND read_at IS NULL`,
    actor.id,
  );
  return { ok: true };
}

export async function getNotificationPreferences(actor: NotificationActor) {
  const preferences = await db.notificationPreference.findUnique({
    where: { userId: actor.id },
  });
  return preferences ?? {
    userId: actor.id,
    mutedTypes: [],
    emailEnabled: false,
    updatedAt: null,
  };
}

export async function updateNotificationPreferences({
  actor,
  input,
}: {
  actor: NotificationActor;
  input: z.infer<typeof notificationPreferencesSchema>;
}) {
  await db.notificationPreference.upsert({
    where: { userId: actor.id },
    create: {
      userId: actor.id,
      mutedTypes: input.mutedTypes,
      emailEnabled: input.emailEnabled,
    },
    update: {
      mutedTypes: input.mutedTypes,
      emailEnabled: input.emailEnabled,
      updatedAt: new Date(),
    },
  });
  return getNotificationPreferences(actor);
}

