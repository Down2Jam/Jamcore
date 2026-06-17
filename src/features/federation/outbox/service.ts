import {
  buildCommentObject,
  buildCreateActivity,
  buildGameObject,
  buildOrderedCollection,
  buildPostObject,
  buildTrackObject,
} from "../protocol/serializers.js";
import {
  getJamActorId,
  getJamOutboxId,
  getUserActorId,
  getUserOutboxId,
} from "../protocol/urls.js";
import { getJamOutboxItems, getUserOutboxItems } from "../models/service.js";
import { publishActivityToFollowers } from "./publication.service.js";

type JamOutboxItems = Awaited<ReturnType<typeof getJamOutboxItems>>;
type UserOutboxItems = Awaited<ReturnType<typeof getUserOutboxItems>>;
type OutboxItems = JamOutboxItems | UserOutboxItems;

function sortActivitiesByPublished<T extends { published?: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      new Date(String(b.published)).getTime() -
      new Date(String(a.published)).getTime(),
  );
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit) {
    return 20;
  }

  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function buildActivitiesFromOutboxItems(items: OutboxItems) {
  return [
    ...items.posts.map((post) =>
      buildCreateActivity({
        kind: "posts",
        id: post.id,
        actorId: getUserActorId(post.author.slug),
        object: buildPostObject(post),
        published: post.createdAt,
      }),
    ),
    ...items.comments.map((comment) =>
      buildCreateActivity({
        kind: "comments",
        id: comment.id,
        actorId: getUserActorId(comment.author.slug),
        object: buildCommentObject(comment),
        published: comment.createdAt,
      }),
    ),
    ...items.games.map((game) =>
      buildCreateActivity({
        kind: "games",
        id: game.slug,
        actorId: game.team?.owner?.slug
          ? getUserActorId(game.team.owner.slug)
          : getJamActorId(),
        object: buildGameObject(game),
        published: game.createdAt,
      }),
    ),
    ...items.tracks.map((track) =>
      buildCreateActivity({
        kind: "tracks",
        id: track.slug,
        actorId: getUserActorId(track.composer.slug),
        object: buildTrackObject(track),
        published: track.createdAt,
      }),
    ),
  ];
}

export async function publishActivityToActorFollowers({
  actorId,
  activity,
}: {
  actorId: string;
  activity: unknown;
}) {
  return publishActivityToFollowers({
    actorId,
    activity,
  });
}

export async function buildJamOutboxCollection(
  limit?: number,
  tenantId?: string | null,
) {
  const normalizedLimit = normalizeLimit(limit);
  const items = await getJamOutboxItems(normalizedLimit, tenantId);
  const orderedItems = sortActivitiesByPublished(
    buildActivitiesFromOutboxItems(items),
  ).slice(0, normalizedLimit);

  return {
    ...buildOrderedCollection(getJamOutboxId()),
    totalItems: orderedItems.length,
    orderedItems,
  };
}

export async function buildUserOutboxCollection({
  slug,
  limit,
  tenantId,
}: {
  slug: string;
  limit?: number;
  tenantId?: string | null;
}) {
  const normalizedLimit = normalizeLimit(limit);
  const items = await getUserOutboxItems(slug, normalizedLimit, tenantId);
  const orderedItems = sortActivitiesByPublished(
    buildActivitiesFromOutboxItems(items),
  ).slice(0, normalizedLimit);

  return {
    ...buildOrderedCollection(getUserOutboxId(slug)),
    totalItems: orderedItems.length,
    orderedItems,
  };
}

