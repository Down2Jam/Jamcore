import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import axios from "axios";
import { z } from "zod";

import {
  getPersistedRemoteActor,
  upsertPersistedRemoteActor,
} from "../state/state.service.js";

const remoteActorSchema = z.object({
  id: z.string().url(),
  type: z.string(),
  preferredUsername: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  inbox: z.string().url().optional(),
  outbox: z.string().url().optional(),
  url: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  icon: z
    .object({
      url: z.string().url(),
    })
    .optional(),
  publicKey: z
    .object({
      id: z.string().url(),
      owner: z.string().url(),
      publicKeyPem: z.string(),
    })
    .optional(),
});

type RemoteActor = z.infer<typeof remoteActorSchema>;

const actorCache = new Map<
  string,
  {
    expiresAt: number;
    actor: RemoteActor;
  }
>();

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ACTOR_RESPONSE_BYTES = 256 * 1024;

function isPrivateIPv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isBlockedIPv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

function isBlockedAddress(address: string) {
  const normalizedAddress = address.replace(/^\[|\]$/g, "");
  const version = isIP(normalizedAddress);
  if (version === 4) {
    return isPrivateIPv4(normalizedAddress);
  }
  if (version === 6) {
    return isBlockedIPv6(normalizedAddress);
  }
  return true;
}

async function assertPublicHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid remote actor URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Unsupported remote actor URL protocol");
  }
  if (url.username || url.password) {
    throw new Error("Remote actor URL credentials are not allowed");
  }

  const literalVersion = isIP(url.hostname);
  if (literalVersion !== 0) {
    if (isBlockedAddress(url.hostname)) {
      throw new Error("Remote actor URL resolves to a private address");
    }
    return;
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address.address))) {
    throw new Error("Remote actor URL resolves to a private address");
  }
}

export async function fetchRemoteActor(actorId: string) {
  await assertPublicHttpUrl(actorId);

  const cached = actorCache.get(actorId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.actor;
  }

  const persisted = await getPersistedRemoteActor(actorId);
  if (persisted && persisted.expiresAt > Date.now()) {
    actorCache.set(actorId, {
      actor: persisted.actor,
      expiresAt: persisted.expiresAt,
    });
    return persisted.actor;
  }

  const response = await axios.get(actorId, {
    headers: {
      Accept:
        'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    },
    timeout: 10_000,
    maxRedirects: 0,
    maxContentLength: MAX_ACTOR_RESPONSE_BYTES,
    maxBodyLength: MAX_ACTOR_RESPONSE_BYTES,
  });

  const actor = remoteActorSchema.parse(response.data);
  actorCache.set(actorId, {
    actor,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  await upsertPersistedRemoteActor({
    actorId,
    actor,
    expiresAt: Date.now() + CACHE_TTL_MS,
    updatedAt: new Date().toISOString(),
  });

  return actor;
}

export async function resolveRemoteActorProfile(actorId: string) {
  try {
    const actor = await fetchRemoteActor(actorId);
    return {
      id: actor.id,
      preferredUsername: actor.preferredUsername ?? null,
      name: actor.name ?? actor.preferredUsername ?? actor.id,
      summary: actor.summary ?? null,
      inbox: actor.inbox ?? null,
      outbox: actor.outbox ?? null,
      iconUrl: actor.icon?.url ?? null,
      url: Array.isArray(actor.url) ? actor.url[0] ?? null : actor.url ?? null,
    };
  } catch {
    return {
      id: actorId,
      preferredUsername: null,
      name: actorId,
      summary: null,
      inbox: null,
      outbox: null,
      iconUrl: null,
      url: null,
    };
  }
}

export function clearRemoteActorCache() {
  actorCache.clear();
}
