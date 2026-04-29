import { getJamActorId, getUserActorId } from "../protocol/urls.js";
import {
  getPersistedFollower,
  getPersistedFollowing,
  listPersistedFollowersByTargetActorId,
  listPersistedFollowingByActorId,
  upsertPersistedFollower,
  upsertPersistedFollowing,
} from "./state.service.js";

export async function recordFollower({
  activityId,
  actorId,
  targetActorId,
  inbox,
}: {
  activityId: string;
  actorId: string;
  targetActorId: string;
  inbox: string | null;
}) {
  const now = new Date().toISOString();
  await upsertPersistedFollower({
    id: activityId,
    actorId,
    targetActorId,
    inbox,
    status: "active",
    followedAt: now,
    updatedAt: now,
  });
}

export async function undoFollower(activityId: string) {
  const existing = await getPersistedFollower(activityId);
  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    status: "undone" as const,
    updatedAt: new Date().toISOString(),
  };
  await upsertPersistedFollower(updated);
  return updated;
}

export async function recordFollowing({
  activityId,
  actorId,
  targetActorId,
  targetInbox,
}: {
  activityId: string;
  actorId: string;
  targetActorId: string;
  targetInbox: string | null;
}) {
  const now = new Date().toISOString();
  await upsertPersistedFollowing({
    id: activityId,
    actorId,
    targetActorId,
    targetInbox,
    status: "active",
    followedAt: now,
    updatedAt: now,
  });
}

export async function undoFollowing(activityId: string) {
  const existing = await getPersistedFollowing(activityId);
  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    status: "undone" as const,
    updatedAt: new Date().toISOString(),
  };
  await upsertPersistedFollowing(updated);
  return updated;
}

export async function buildFollowersCollection(targetActorId: string) {
  const followers = await listPersistedFollowersByTargetActorId(targetActorId);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${targetActorId}/followers`,
    type: "OrderedCollection",
    totalItems: followers.length,
    orderedItems: followers
      .sort(
        (a, b) =>
          new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime(),
      )
      .map((entry) => entry.actorId),
  };
}

export async function buildFollowingCollection(actorId: string) {
  const following = await listPersistedFollowingByActorId(actorId);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${actorId}/following`,
    type: "OrderedCollection",
    totalItems: following.length,
    orderedItems: following
      .sort(
        (a, b) =>
          new Date(b.followedAt).getTime() - new Date(a.followedAt).getTime(),
      )
      .map((entry) => entry.targetActorId),
  };
}

export function getTargetActorIdForFollowerCollection(
  target: { kind: "jam" } | { kind: "user"; slug: string },
) {
  return target.kind === "jam" ? getJamActorId() : getUserActorId(target.slug);
}
