import { enqueueFederationDelivery } from "../transport/delivery.service.js";
import { listPersistedFollowersByTargetActorId } from "../state/state.service.js";

async function listAudienceInboxes(actorIds: string[]) {
  const inboxes = new Set<string>();

  const followerLists = await Promise.all(
    [...new Set(actorIds)].map((actorId) =>
      listPersistedFollowersByTargetActorId(actorId),
    ),
  );

  for (const followers of followerLists) {
    for (const follower of followers) {
      if (follower.inbox) {
        inboxes.add(follower.inbox);
      }
    }
  }

  return [...inboxes];
}

export async function publishActivityToFollowers({
  actorId,
  activity,
}: {
  actorId: string;
  activity: unknown;
}) {
  const deliveryIds = await publishActivityToAudience({
    actorIds: [actorId],
    activity,
  });

  return deliveryIds.filter((id): id is string => Boolean(id));
}

export async function publishActivityToAudience({
  actorIds,
  activity,
}: {
  actorIds: string[];
  activity: unknown;
}) {
  const inboxes = await listAudienceInboxes(actorIds);
  const deliveryIds = await Promise.all(
    inboxes.map((inbox) =>
      enqueueFederationDelivery({
        inbox,
        activity,
      }),
    ),
  );

  return deliveryIds.filter((id): id is string => Boolean(id));
}

