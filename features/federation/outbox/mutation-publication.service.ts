import {
  buildCommentObject,
  buildCreateActivity,
  buildGameObject,
  buildPostObject,
  buildTrackObject,
  buildUpdateActivity,
} from "../protocol/serializers.js";
import { getJamActorId, getUserActorId } from "../protocol/urls.js";
import {
  getFederatedCommentById,
  getFederatedGameBySlug,
  getFederatedPostById,
  getFederatedTrackBySlug,
} from "../models/service.js";
import { publishActivityToAudience } from "./publication.service.js";

function getGameActorId(game: Awaited<ReturnType<typeof getFederatedGameBySlug>>) {
  return game.team?.owner?.slug
    ? getUserActorId(game.team.owner.slug)
    : getJamActorId();
}

function buildAudienceActorIds(primaryActorId: string) {
  return primaryActorId === getJamActorId()
    ? [primaryActorId]
    : [getJamActorId(), primaryActorId];
}

async function publishActivityForAudience({
  activity,
  actorId,
}: {
  activity: unknown;
  actorId: string;
}) {
  return publishActivityToAudience({
    actorIds: buildAudienceActorIds(actorId),
    activity,
  });
}

export async function publishPostCreated(postId: number) {
  const post = await getFederatedPostById(postId);
  const actorId = getUserActorId(post.author.slug);

  return publishActivityForAudience({
    actorId,
    activity: buildCreateActivity({
      kind: "posts",
      id: post.id,
      actorId,
      object: buildPostObject(post),
      published: post.createdAt,
    }),
  });
}

export async function publishPostUpdated(postId: number) {
  const post = await getFederatedPostById(postId);
  const actorId = getUserActorId(post.author.slug);

  return publishActivityForAudience({
    actorId,
    activity: buildUpdateActivity({
      kind: "posts",
      id: post.id,
      actorId,
      object: buildPostObject(post),
      published: post.updatedAt,
    }),
  });
}

export async function publishCommentCreated(commentId: number) {
  const comment = await getFederatedCommentById(commentId);
  const actorId = getUserActorId(comment.author.slug);

  return publishActivityForAudience({
    actorId,
    activity: buildCreateActivity({
      kind: "comments",
      id: comment.id,
      actorId,
      object: buildCommentObject(comment),
      published: comment.createdAt,
    }),
  });
}

export async function publishCommentUpdated(commentId: number) {
  const comment = await getFederatedCommentById(commentId);
  const actorId = getUserActorId(comment.author.slug);

  return publishActivityForAudience({
    actorId,
    activity: buildUpdateActivity({
      kind: "comments",
      id: comment.id,
      actorId,
      object: buildCommentObject(comment),
      published: comment.updatedAt,
    }),
  });
}

export async function publishGameCreated(slug: string) {
  const game = await getFederatedGameBySlug(slug);
  const actorId = getGameActorId(game);

  return publishActivityForAudience({
    actorId,
    activity: buildCreateActivity({
      kind: "games",
      id: game.slug,
      actorId,
      object: buildGameObject(game),
      published: game.createdAt,
    }),
  });
}

export async function publishGameUpdated(slug: string) {
  const game = await getFederatedGameBySlug(slug);
  const actorId = getGameActorId(game);

  return publishActivityForAudience({
    actorId,
    activity: buildUpdateActivity({
      kind: "games",
      id: game.slug,
      actorId,
      object: buildGameObject(game),
      published: game.updatedAt,
    }),
  });
}

export async function publishTrackUpdated(slug: string) {
  const track = await getFederatedTrackBySlug(slug);
  const actorId = getUserActorId(track.composer.slug);

  return publishActivityForAudience({
    actorId,
    activity: buildUpdateActivity({
      kind: "tracks",
      id: track.slug,
      actorId,
      object: buildTrackObject(track),
      published: track.updatedAt,
    }),
  });
}

