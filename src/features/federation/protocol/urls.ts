import { appConfig } from "../../../config/app.js";
import { env } from "../../../config/env.js";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getFederationOrigin() {
  return trimTrailingSlash(env.federationOrigin || appConfig.publicOrigin);
}

export function getJamActorHandle() {
  return `${appConfig.federation.jamActor.username}@${new URL(getFederationOrigin()).hostname}`;
}

export function getJamActorId() {
  return `${getFederationOrigin()}/ap/actors/jam`;
}

export function getJamInboxId() {
  return `${getJamActorId()}/inbox`;
}

export function getJamOutboxId() {
  return `${getJamActorId()}/outbox`;
}

export function getUserActorId(slug: string) {
  return `${getFederationOrigin()}/ap/actors/users/${slug}`;
}

export function getUserInboxId(slug: string) {
  return `${getUserActorId(slug)}/inbox`;
}

export function getUserOutboxId(slug: string) {
  return `${getUserActorId(slug)}/outbox`;
}

export function getPostObjectId(id: number) {
  return `${getFederationOrigin()}/ap/objects/posts/${id}`;
}

export function getCommentObjectId(id: number) {
  return `${getFederationOrigin()}/ap/objects/comments/${id}`;
}

export function getGameObjectId(slug: string) {
  return `${getFederationOrigin()}/ap/objects/games/${slug}`;
}

export function getTrackObjectId(slug: string) {
  return `${getFederationOrigin()}/ap/objects/tracks/${slug}`;
}

export function getCreateActivityId(kind: string, id: string | number) {
  return `${getFederationOrigin()}/ap/activities/create/${kind}/${id}`;
}

export function getUpdateActivityId(kind: string, id: string | number) {
  return `${getFederationOrigin()}/ap/activities/update/${kind}/${id}`;
}

export function isJamActorId(value: string | null | undefined) {
  return value === getJamActorId();
}

export function isUserActorId(value: string | null | undefined, slug?: string) {
  if (!value) {
    return false;
  }

  if (slug) {
    return value === getUserActorId(slug);
  }

  return value.startsWith(`${getFederationOrigin()}/ap/actors/users/`);
}

export function parseLocalObjectReference(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const origin = getFederationOrigin().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    {
      kind: "post" as const,
      regex: new RegExp(`^${origin}/ap/objects/posts/(\\d+)$`),
      transform: (match: RegExpMatchArray) => ({ id: Number(match[1]) }),
    },
    {
      kind: "comment" as const,
      regex: new RegExp(`^${origin}/ap/objects/comments/(\\d+)$`),
      transform: (match: RegExpMatchArray) => ({ id: Number(match[1]) }),
    },
    {
      kind: "game" as const,
      regex: new RegExp(`^${origin}/ap/objects/games/([^/]+)$`),
      transform: (match: RegExpMatchArray) => ({ slug: match[1] }),
    },
    {
      kind: "track" as const,
      regex: new RegExp(`^${origin}/ap/objects/tracks/([^/]+)$`),
      transform: (match: RegExpMatchArray) => ({ slug: match[1] }),
    },
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern.regex);
    if (match) {
      return {
        kind: pattern.kind,
        ...pattern.transform(match),
      };
    }
  }

  return null;
}

export function getFollowersCollectionId(actorId: string) {
  return `${actorId}/followers`;
}

export function getFollowingCollectionId(actorId: string) {
  return `${actorId}/following`;
}

export function getFeaturedCollectionId(actorId: string) {
  return `${actorId}/featured`;
}

export function getNodeInfoWellKnownId() {
  return `${getFederationOrigin()}/.well-known/nodeinfo`;
}

export function getNodeInfoDocumentId() {
  return `${getFederationOrigin()}/nodeinfo/2.1`;
}

export function getWebFingerId(resource: string) {
  return `${getFederationOrigin()}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;
}

export function resolvePublicUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${getFederationOrigin()}${normalizedPath}`;
}

