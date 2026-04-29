import { getJamActorId, getUserActorId } from "./urls.js";

export type FollowActivityRef = {
  id?: string;
  actor?: string;
  object: string;
};

export function buildAcceptActivity({
  actorId,
  follow,
}: {
  actorId: string;
  follow: FollowActivityRef;
}) {
  const followId = follow.id ?? `${actorId}#follow`;

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${actorId}/accept/${encodeURIComponent(followId)}`,
    type: "Accept",
    actor: actorId,
    object: {
      id: followId,
      type: "Follow",
      actor: follow.actor,
      object: follow.object,
    },
  };
}

export function getActorIdForInboxTarget(
  target: { kind: "jam" } | { kind: "user"; slug: string },
) {
  return target.kind === "jam" ? getJamActorId() : getUserActorId(target.slug);
}
