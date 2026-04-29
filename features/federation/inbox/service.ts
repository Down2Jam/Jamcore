import { appConfig } from "../../../config/app.js";
import { filterCoreEntityIdsByTenant } from "../../../infra/coreTenantStore.js";
import db from "../../../infra/db.js";
import {
  assertCommentTargetBelongsToTenant,
  assertGameBelongsToTenant,
  assertPostBelongsToTenant,
} from "../../../lib/contentTenant.js";
import { buildAcceptActivity, getActorIdForInboxTarget } from "../protocol/activities.js";
import { buildFederatedContent } from "../protocol/content.js";
import { inboxActivitySchema, type InboxActivity } from "../protocol/schemas.js";
import {
  getJamActorId,
  getUserActorId,
  isJamActorId,
  parseLocalObjectReference,
} from "../protocol/urls.js";
import { BadRequestError, NotFoundError } from "../../../lib/errors.js";
import { enqueueFederationDelivery } from "../transport/delivery.service.js";
import {
  recordFollower,
  recordFollowing,
  undoFollower,
  undoFollowing,
} from "../state/followers.service.js";
import { resolveRemoteActorProfile } from "../models/remote-actor.service.js";
import {
  incrementFederationReputation,
  isFederationActorAllowed,
  isFederationActorBlocked,
  isFederationActorPreviewRequired,
  queueFederationPreview,
} from "../admin.service.js";
import {
  isD2JamTagged,
  isLemmyCreate,
  upsertRemoteCommentFromActivity,
  upsertRemoteFeedPostFromActivity,
} from "../remote-content.service.js";

type InboxTarget =
  | { kind: "jam" }
  | { kind: "user"; slug: string };

type InboxResult = {
  accepted: true;
  statusCode: number;
  summary: string;
  activity?: unknown;
  deliveryId?: string | null;
};

async function createNotificationForUsers(
  recipientIds: number[],
  payload: {
    type: "GENERAL" | "FOLLOW" | "COMMENT_REPLY" | "POST_COMMENT" | "GAME_COMMENT" | "TRACK_COMMENT";
    title: string;
    body: string;
    link?: string;
    data?: unknown;
  },
) {
  if (recipientIds.length === 0) {
    return;
  }

  await db.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link,
      data: payload.data as object | undefined,
    })),
  });
}

async function getJamModeratorIds(tenantId?: string | null) {
  const users = await db.user.findMany({
    where: {
      OR: [{ admin: true }, { mod: true }],
    },
    select: {
      id: true,
    },
  });

  const userIds = users.map((user) => user.id);
  return filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: userIds,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
}

async function resolveObjectRecipient(
  reference: NonNullable<ReturnType<typeof parseLocalObjectReference>>,
  tenantId?: string | null,
) {
  switch (reference.kind) {
    case "post": {
      if (!("id" in reference)) {
        throw new BadRequestError("Invalid post reference");
      }
      const post = await db.post.findUnique({
        where: { id: reference.id },
        select: { authorId: true, id: true, deletedAt: true, removedAt: true },
      });
      if (!post || post.deletedAt || post.removedAt) {
        throw new NotFoundError("Referenced post not found");
      }
      await assertPostBelongsToTenant(post.id, tenantId);
      return {
        recipientId: post.authorId,
        type: "POST_COMMENT" as const,
        link: `/forum/posts/${post.id}`,
      };
    }
    case "comment": {
      if (!("id" in reference)) {
        throw new BadRequestError("Invalid comment reference");
      }
      const comment = await db.comment.findUnique({
        where: { id: reference.id },
        select: {
          authorId: true,
          id: true,
          deletedAt: true,
          removedAt: true,
          postId: true,
          gameId: true,
          gamePage: {
            select: {
              game: {
                select: { id: true },
              },
            },
          },
          track: {
            select: {
              gamePage: {
                select: {
                  game: {
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!comment || comment.deletedAt || comment.removedAt) {
        throw new NotFoundError("Referenced comment not found");
      }
      await assertCommentTargetBelongsToTenant(comment, tenantId);
      return {
        recipientId: comment.authorId,
        type: "COMMENT_REPLY" as const,
        link: `/comments/${comment.id}`,
      };
    }
    case "game": {
      if (!("slug" in reference)) {
        throw new BadRequestError("Invalid game reference");
      }
      const game = await db.game.findUnique({
        where: { slug: reference.slug },
        select: {
          id: true,
          slug: true,
          published: true,
          team: { select: { ownerId: true } },
        },
      });
      if (!game || !game.published) {
        throw new NotFoundError("Referenced game not found");
      }
      await assertGameBelongsToTenant(game.id, tenantId);
      return {
        recipientId: game.team.ownerId,
        type: "GAME_COMMENT" as const,
        link: `/games/${game.slug}`,
      };
    }
    case "track": {
      if (!("slug" in reference)) {
        throw new BadRequestError("Invalid track reference");
      }
      const track = await db.gamePageTrack.findFirst({
        where: {
          slug: reference.slug,
          gamePage: {
            game: {
              published: true,
            },
          },
        },
        select: {
          composerId: true,
          slug: true,
          gamePage: {
            select: {
              game: {
                select: { id: true },
              },
            },
          },
        },
      });
      if (!track) throw new NotFoundError("Referenced track not found");
      await assertGameBelongsToTenant(track.gamePage.game.id, tenantId);
      return {
        recipientId: track.composerId,
        type: "TRACK_COMMENT" as const,
        link: `/tracks/${track.slug}`,
      };
    }
  }
}

async function handleFollowActivity(
  activity: Extract<InboxActivity, { type: "Follow" }>,
  target: InboxTarget,
  tenantId?: string | null,
): Promise<InboxResult> {
  const remoteActor = await resolveRemoteActorProfile(activity.actor);
  const acceptActivity = buildAcceptActivity({
    actorId: getActorIdForInboxTarget(target),
    follow: activity,
  });
  const deliveryId = await enqueueFederationDelivery({
    inbox: remoteActor.inbox,
    activity: acceptActivity,
    tenantId,
  });
  await recordFollower({
    activityId: activity.id,
    actorId: activity.actor,
    targetActorId: getActorIdForInboxTarget(target),
    inbox: remoteActor.inbox,
  });
  await recordFollowing({
    activityId: activity.id,
    actorId: getActorIdForInboxTarget(target),
    targetActorId: activity.actor,
    targetInbox: remoteActor.inbox,
  });

  if (target.kind === "jam" && !isJamActorId(activity.object)) {
    throw new BadRequestError("Follow target does not match jam actor");
  }

  if (target.kind === "user" && activity.object !== getUserActorId(target.slug)) {
    throw new BadRequestError("Follow target does not match user actor");
  }

  if (target.kind === "jam") {
    const moderatorIds = await getJamModeratorIds(tenantId);
    await createNotificationForUsers(moderatorIds, {
      type: "GENERAL",
      title: "Remote jam follow",
      body: `${remoteActor.name} followed the jam actor.`,
      link: "/",
      data: {
        activityId: activity.id,
        actor: activity.actor,
        object: activity.object,
        acceptActivity,
        deliveryId,
      },
    });

    return {
      accepted: true,
      statusCode: 202,
      summary: "Accepted remote follow for jam actor",
      activity: acceptActivity,
      deliveryId,
    };
  }

  const user = await db.user.findUnique({
    where: { slug: target.slug },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError("Federated user not found");
  }
  const allowedUserIds = await filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: [user.id],
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!allowedUserIds.includes(user.id)) {
    throw new NotFoundError("Federated user not found");
  }

  await createNotificationForUsers([user.id], {
    type: "FOLLOW",
    title: "Remote follower",
    body: `${remoteActor.name} followed your federated profile.`,
    link: `/u/${target.slug}`,
    data: {
      activityId: activity.id,
      actor: activity.actor,
      object: activity.object,
      acceptActivity,
      deliveryId,
    },
  });

  return {
    accepted: true,
    statusCode: 202,
    summary: "Accepted remote follow for user actor",
    activity: acceptActivity,
    deliveryId,
  };
}

async function handleEngagementActivity(
  activity: Extract<InboxActivity, { type: "Like" | "Announce" }>,
  tenantId?: string | null,
): Promise<InboxResult> {
  const reference = parseLocalObjectReference(activity.object);
  if (!reference) {
    return {
      accepted: true,
      statusCode: 202,
      summary: "Ignored engagement for non-local object",
    };
  }

  const target = await resolveObjectRecipient(reference, tenantId);
  await createNotificationForUsers([target.recipientId], {
    type: "GENERAL",
    title: `Remote ${activity.type.toLowerCase()}`,
    body: `${activity.actor} sent a ${activity.type.toLowerCase()} for your federated object.`,
    link: target.link,
    data: {
      activityId: activity.id,
      actor: activity.actor,
      object: activity.object,
      type: activity.type,
    },
  });

  return {
    accepted: true,
    statusCode: 202,
    summary: `Accepted remote ${activity.type.toLowerCase()}`,
  };
}

async function handleCreateActivity(
  activity: Extract<InboxActivity, { type: "Create" }>,
  tenantId?: string | null,
): Promise<InboxResult> {
  const inReplyTo = activity.object.inReplyTo;
  const reference = parseLocalObjectReference(inReplyTo);

  if (!reference) {
    if (isD2JamTagged(activity) || isLemmyCreate(activity)) {
      await upsertRemoteFeedPostFromActivity(activity, tenantId);
      return {
        accepted: true,
        statusCode: 202,
        summary: "Accepted remote feed post",
      };
    }

    return {
      accepted: true,
      statusCode: 202,
      summary: "Ignored remote create without local reply target",
    };
  }

  const target = await resolveObjectRecipient(reference, tenantId);
  await upsertRemoteCommentFromActivity({
    activity,
    reference,
    tenantId,
  });
  const rendered = buildFederatedContent({
    value: activity.object.content,
  });

  await createNotificationForUsers([target.recipientId], {
    type: target.type,
    title: "Remote reply",
    body: `${activity.actor} replied over federation.`,
    link: target.link,
    data: {
      activityId: activity.id,
      actor: activity.actor,
      objectId: activity.object.id,
      inReplyTo,
      content: rendered.content,
    },
  });

  return {
    accepted: true,
    statusCode: 202,
    summary: "Accepted remote reply",
  };
}

async function handleUndoActivity(
  activity: Extract<InboxActivity, { type: "Undo" }>,
): Promise<InboxResult> {
  if (activity.object.type === "Follow" && activity.object.id) {
    await undoFollower(activity.object.id);
    await undoFollowing(activity.object.id);
  }

  return {
    accepted: true,
    statusCode: 202,
    summary: `Accepted undo for ${activity.object.type.toLowerCase()}`,
  };
}

export async function handleInboxActivity({
  target,
  body,
  tenantId,
}: {
  target: InboxTarget;
  body: unknown;
  tenantId?: string | null;
}) {
  const activity = inboxActivitySchema.parse(body);
  if (await isFederationActorBlocked(activity.actor, tenantId)) {
    throw new BadRequestError("Federation actor is blocked");
  }
  if (!(await isFederationActorAllowed(activity.actor, tenantId))) {
    throw new BadRequestError("Federation actor is not trusted");
  }
  if (await isFederationActorPreviewRequired(activity.actor, tenantId)) {
    return queueFederationPreview({
      actorId: activity.actor,
      activity,
      tenantId,
    });
  }

  let result: InboxResult | undefined;
  switch (activity.type) {
    case "Follow":
      result = await handleFollowActivity(activity, target, tenantId);
      break;
    case "Like":
    case "Announce":
      result = await handleEngagementActivity(activity, tenantId);
      break;
    case "Create":
      result = await handleCreateActivity(activity, tenantId);
      break;
    case "Undo":
      result = await handleUndoActivity(activity);
      break;
  }
  await incrementFederationReputation({
    actorId: activity.actor,
    tenantId,
    field: "accepted_activities",
  });
  return result;
}

export function getInboxTargetForJam(): InboxTarget {
  return { kind: "jam" };
}

export function getInboxTargetForUser(slug: string): InboxTarget {
  return { kind: "user", slug };
}


