import type {
  Notification,
  NotificationType,
  Prisma,
} from "@prisma/client";

import db from "../../infra/db.js";

type NotificationClient =
  | Pick<typeof db, "notification" | "notificationPreference">
  | Pick<Prisma.TransactionClient, "notification" | "notificationPreference">;

const DEFAULT_OFF_TYPES = new Set<NotificationType>(["STREAM_LIVE"]);

function preferenceTypeSet(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return new Set<string>();

  return new Set(value.filter((item): item is string => typeof item === "string"));
}

export async function isNotificationEnabled({
  recipientId,
  type,
  client = db,
}: {
  recipientId: number;
  type: NotificationType;
  client?: NotificationClient;
}) {
  const preference = await client.notificationPreference.findUnique({
    where: { userId: recipientId },
    select: { mutedTypes: true, enabledTypes: true },
  });
  const mutedTypes = preferenceTypeSet(preference?.mutedTypes ?? []);
  const enabledTypes = preferenceTypeSet(preference?.enabledTypes ?? []);

  return DEFAULT_OFF_TYPES.has(type)
    ? enabledTypes.has(type)
    : !mutedTypes.has(type);
}

export async function createNotification(
  data: Prisma.NotificationCreateManyInput,
  client: NotificationClient = db,
): Promise<Notification | null> {
  if (
    !(await isNotificationEnabled({
      recipientId: data.recipientId,
      type: data.type,
      client,
    }))
  ) {
    return null;
  }

  return client.notification.create({ data });
}

export async function createNotifications(
  data: Prisma.NotificationCreateManyInput[],
  client: NotificationClient = db,
) {
  if (data.length === 0) return { count: 0 };

  const recipientIds = [...new Set(data.map((notification) => notification.recipientId))];
  const preferences = await client.notificationPreference.findMany({
    where: { userId: { in: recipientIds } },
    select: { userId: true, mutedTypes: true, enabledTypes: true },
  });
  const preferencesByUserId = new Map(
    preferences.map((preference) => [preference.userId, preference]),
  );
  const enabled = data.filter((notification) => {
    const preference = preferencesByUserId.get(notification.recipientId);
    const mutedTypes = preferenceTypeSet(preference?.mutedTypes ?? []);
    const enabledTypes = preferenceTypeSet(preference?.enabledTypes ?? []);

    return DEFAULT_OFF_TYPES.has(notification.type)
      ? enabledTypes.has(notification.type)
      : !mutedTypes.has(notification.type);
  });

  return enabled.length > 0
    ? client.notification.createMany({ data: enabled, skipDuplicates: true })
    : { count: 0 };
}
