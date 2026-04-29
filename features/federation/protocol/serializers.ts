import { appConfig } from "../../../config/app.js";
import { buildFederatedContent, type FederationEmoji } from "./content.js";
import { buildActorPublicKey } from "./keys.js";
import {
  getCommentObjectId,
  getCreateActivityId,
  getUpdateActivityId,
  getFeaturedCollectionId,
  getFollowersCollectionId,
  getFollowingCollectionId,
  getGameObjectId,
  getJamActorHandle,
  getJamActorId,
  getJamInboxId,
  getJamOutboxId,
  getPostObjectId,
  getTrackObjectId,
  getNodeInfoDocumentId,
  getNodeInfoWellKnownId,
  getUserActorId,
  getUserInboxId,
  getUserOutboxId,
  getWebFingerId,
  resolvePublicUrl,
} from "./urls.js";

const ACTIVITY_STREAMS_CONTEXT = [
  "https://www.w3.org/ns/activitystreams",
  "https://w3id.org/security/v1",
  {
    toot: "http://joinmastodon.org/ns#",
    featured: {
      "@id": "toot:featured",
      "@type": "@id",
    },
  },
] as const;

type FederationJamView = {
  name?: string | null;
  icon?: string | null;
  color?: string | null;
};

type FederationUserView = {
  slug: string;
  name: string;
  bio?: string | null;
  short?: string | null;
  profilePicture?: string | null;
  bannerPicture?: string | null;
};

export function buildJamActor(
  jam?: FederationJamView | null,
  publicKeyPem?: string | null,
) {
  const actorId = getJamActorId();

  return {
    "@context": ACTIVITY_STREAMS_CONTEXT,
    id: actorId,
    type: "Group",
    preferredUsername: appConfig.federation.jamActor.username,
    name: jam?.name || appConfig.federation.jamActor.name,
    summary: appConfig.federation.jamActor.summary,
    inbox: getJamInboxId(),
    outbox: getJamOutboxId(),
    followers: getFollowersCollectionId(actorId),
    following: getFollowingCollectionId(actorId),
    featured: getFeaturedCollectionId(actorId),
    url: appConfig.publicOrigin,
    discoverable: true,
    ...(publicKeyPem ? { publicKey: buildActorPublicKey(actorId, publicKeyPem) } : {}),
    ...(jam?.icon
      ? {
          icon: {
            type: "Image",
            url: resolvePublicUrl(jam.icon),
          },
        }
      : {}),
    ...(jam?.color
      ? {
          attachment: [
            {
              type: "PropertyValue",
              name: "Accent color",
              value: jam.color,
            },
          ],
        }
      : {}),
  };
}

type ActorRef = {
  slug: string;
};

type FederatedPostView = {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: ActorRef;
  collaborators?: ActorRef[];
};

type FederatedCommentView = {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: ActorRef;
  postId?: number | null;
  commentId?: number | null;
  gameSlug?: string | null;
  trackSlug?: string | null;
};

type FederatedGameView = {
  slug: string;
  updatedAt: Date;
  createdAt: Date;
  category: string;
  gamePage?: {
    name: string;
    description?: string | null;
    short?: string | null;
    screenshots?: string[];
    thumbnail?: string | null;
    trailerUrl?: string | null;
  } | null;
  team?: {
    owner?: ActorRef | null;
  } | null;
  emojis?: FederationEmoji[];
};

type FederatedTrackView = {
  slug: string;
  name: string;
  commentary?: string | null;
  url: string;
  createdAt: Date;
  updatedAt: Date;
  composer: ActorRef;
  gamePage?: {
    game?: {
      slug: string;
    } | null;
  } | null;
  emojis?: FederationEmoji[];
};

function getCommentInReplyTo(comment: FederatedCommentView) {
  if (comment.commentId) {
    return getCommentObjectId(comment.commentId);
  }
  if (comment.postId) {
    return getPostObjectId(comment.postId);
  }
  if (comment.trackSlug) {
    return getTrackObjectId(comment.trackSlug);
  }
  if (comment.gameSlug) {
    return getGameObjectId(comment.gameSlug);
  }
  return undefined;
}

export function buildPostObject(post: FederatedPostView) {
  const rendered = buildFederatedContent({
    value: post.content,
  });

  return {
    "@context": ACTIVITY_STREAMS_CONTEXT,
    id: getPostObjectId(post.id),
    type: "Article",
    attributedTo:
      post.collaborators && post.collaborators.length > 0
        ? [post.author, ...post.collaborators].map((actor) => getUserActorId(actor.slug))
        : getUserActorId(post.author.slug),
    name: post.title,
    content: rendered.content,
    published: post.createdAt.toISOString(),
    updated: post.updatedAt.toISOString(),
    url: `${appConfig.publicOrigin}/forum/posts/${post.id}`,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [getJamActorId()],
    audience: getJamActorId(),
    ...(rendered.tags.length > 0 ? { tag: rendered.tags } : {}),
  };
}

export function buildCommentObject(comment: FederatedCommentView) {
  const rendered = buildFederatedContent({
    value: comment.content,
  });

  return {
    "@context": ACTIVITY_STREAMS_CONTEXT,
    id: getCommentObjectId(comment.id),
    type: "Note",
    attributedTo: getUserActorId(comment.author.slug),
    content: rendered.content,
    published: comment.createdAt.toISOString(),
    updated: comment.updatedAt.toISOString(),
    inReplyTo: getCommentInReplyTo(comment),
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [getJamActorId()],
    audience: getJamActorId(),
    ...(rendered.tags.length > 0 ? { tag: rendered.tags } : {}),
  };
}

export function buildGameObject(game: FederatedGameView) {
  const rendered = buildFederatedContent({
    value: game.gamePage?.description,
    emojis: game.emojis,
    extraHashtags: [`#${game.category}`],
  });

  return {
    "@context": ACTIVITY_STREAMS_CONTEXT,
    id: getGameObjectId(game.slug),
    type: "Page",
    attributedTo: game.team?.owner?.slug
      ? getUserActorId(game.team.owner.slug)
      : getJamActorId(),
    name: game.gamePage?.name ?? game.slug,
    summary: game.gamePage?.short ?? undefined,
    content: rendered.content,
    published: game.createdAt.toISOString(),
    updated: game.updatedAt.toISOString(),
    url: `${appConfig.publicOrigin}/games/${game.slug}`,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [getJamActorId()],
    audience: getJamActorId(),
    attachment: [
      ...(game.gamePage?.thumbnail
        ? [
            {
              type: "Image",
              url: resolvePublicUrl(game.gamePage.thumbnail),
            },
          ]
        : []),
      ...((game.gamePage?.screenshots ?? []).map((url) => ({
        type: "Image",
        url: resolvePublicUrl(url),
      })) as Array<{ type: string; url: string | null }>),
      ...(game.gamePage?.trailerUrl
        ? [
            {
              type: "Video",
              url: game.gamePage.trailerUrl,
            },
          ]
        : []),
    ].filter((item) => Boolean(item.url)),
    ...(rendered.tags.length > 0 ? { tag: rendered.tags } : {}),
  };
}

export function buildTrackObject(track: FederatedTrackView) {
  const rendered = buildFederatedContent({
    value: track.commentary,
    emojis: track.emojis,
  });

  return {
    "@context": ACTIVITY_STREAMS_CONTEXT,
    id: getTrackObjectId(track.slug),
    type: "Audio",
    attributedTo: getUserActorId(track.composer.slug),
    name: track.name,
    content: rendered.content,
    published: track.createdAt.toISOString(),
    updated: track.updatedAt.toISOString(),
    url: `${appConfig.publicOrigin}/tracks/${track.slug}`,
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [getJamActorId()],
    audience: getJamActorId(),
    attachment: [
      {
        type: "Audio",
        mediaType: "audio/mpeg",
        url: track.url,
      },
    ],
    ...(rendered.tags.length > 0 ? { tag: rendered.tags } : {}),
  };
}

export function buildCreateActivity({
  kind,
  id,
  actorId,
  object,
  published,
}: {
  kind: string;
  id: string | number;
  actorId: string;
  object: unknown;
  published: Date;
}) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: getCreateActivityId(kind, id),
    type: "Create",
    actor: actorId,
    published: published.toISOString(),
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [getJamActorId()],
    object,
  };
}

export function buildUpdateActivity({
  kind,
  id,
  actorId,
  object,
  published,
}: {
  kind: string;
  id: string | number;
  actorId: string;
  object: unknown;
  published: Date;
}) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: getUpdateActivityId(kind, id),
    type: "Update",
    actor: actorId,
    published: published.toISOString(),
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [getJamActorId()],
    object,
  };
}

export function buildUserActor(
  user: FederationUserView,
  publicKeyPem?: string | null,
) {
  const actorId = getUserActorId(user.slug);

  return {
    "@context": ACTIVITY_STREAMS_CONTEXT,
    id: actorId,
    type: "Person",
    preferredUsername: user.slug,
    name: user.name,
    summary: user.bio || user.short || "",
    inbox: getUserInboxId(user.slug),
    outbox: getUserOutboxId(user.slug),
    followers: getFollowersCollectionId(actorId),
    following: getFollowingCollectionId(actorId),
    featured: getFeaturedCollectionId(actorId),
    url: `${appConfig.publicOrigin}/u/${user.slug}`,
    discoverable: true,
    ...(publicKeyPem ? { publicKey: buildActorPublicKey(actorId, publicKeyPem) } : {}),
    ...(user.profilePicture
      ? {
          icon: {
            type: "Image",
            url: resolvePublicUrl(user.profilePicture),
          },
        }
      : {}),
    ...(user.bannerPicture
      ? {
          image: {
            type: "Image",
            url: resolvePublicUrl(user.bannerPicture),
          },
        }
      : {}),
  };
}

export function buildOrderedCollection(id: string) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id,
    type: "OrderedCollection",
    totalItems: 0,
    orderedItems: [],
  };
}

export function buildWebFingerForJam() {
  const resource = `acct:${getJamActorHandle()}`;

  return {
    subject: resource,
    aliases: [getJamActorId()],
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: getJamActorId(),
      },
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: appConfig.publicOrigin,
      },
    ],
  };
}

export function buildWebFingerForUser(user: FederationUserView) {
  const actorId = getUserActorId(user.slug);
  const resource = `acct:${user.slug}@${new URL(getUserActorId(user.slug)).hostname}`;

  return {
    subject: resource,
    aliases: [actorId],
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: actorId,
      },
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: `${appConfig.publicOrigin}/u/${user.slug}`,
      },
    ],
  };
}

export function buildNodeInfoWellKnown() {
  return {
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
        href: getNodeInfoDocumentId(),
      },
    ],
  };
}

export function buildNodeInfo({
  totalUsers,
}: {
  totalUsers: number;
}) {
  return {
    version: "2.1",
    software: {
      name: appConfig.federation.nodeInfo.softwareName,
      version: appConfig.federation.nodeInfo.softwareVersion,
    },
    protocols: appConfig.federation.nodeInfo.protocols,
    services: {
      inbound: [],
      outbound: [],
    },
    openRegistrations: appConfig.federation.nodeInfo.openRegistrations,
    usage: {
      users: {
        total: totalUsers,
        activeMonth: 0,
        activeHalfyear: 0,
      },
      localPosts: 0,
      localComments: 0,
    },
    metadata: {
      nodeName: appConfig.federation.jamActor.name,
      nodeDescription: appConfig.federation.jamActor.summary,
      jamActor: {
        id: getJamActorId(),
        handle: getJamActorHandle(),
        webfinger: getWebFingerId(`acct:${getJamActorHandle()}`),
      },
      webfinger: getNodeInfoWellKnownId(),
    },
  };
}

