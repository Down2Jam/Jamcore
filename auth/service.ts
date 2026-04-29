import type { Request } from "express";
import { z } from "zod";

import { env } from "../config/env.js";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";
import {
  createPersistentServiceKey,
  findPersistentServiceKeyByRawKey,
  listPersistentServiceKeys,
  revokePersistentServiceKey,
  rotatePersistentServiceKey,
} from "./serviceStore.js";

export type ServiceKeyIdentity = {
  createdAt?: string;
  id?: string;
  deprecatedAt?: string;
  name: string;
  scopes: string[];
  source?: "env" | "file";
  tenantId?: string;
  revokedAt?: string;
};

type ServiceKeyRecord = ServiceKeyIdentity & {
  key: string;
};

let cachedServiceKeys: ServiceKeyRecord[] | null = null;

function loadServiceKeys() {
  if (cachedServiceKeys) {
    return cachedServiceKeys;
  }

  if (!env.serviceApiKeys) {
    cachedServiceKeys = [];
    return cachedServiceKeys;
  }

  const parsed = JSON.parse(env.serviceApiKeys) as ServiceKeyRecord[];
  cachedServiceKeys = Array.isArray(parsed) ? parsed : [];
  return cachedServiceKeys;
}

export function listConfiguredServiceKeys(tenantId?: string | null) {
  const envKeys = loadServiceKeys().map(({ key: _key, ...service }) => ({
    ...service,
    source: "env" as const,
  }));
  return listPersistentServiceKeys(tenantId).then((records) => {
    const fileKeys = records.map((service) => ({
      ...service,
      source: "file" as const,
    }));
    return [...envKeys, ...fileKeys];
  });
}

export function getServiceApiKey(req: Request) {
  const headerKey = req.header("x-api-key");
  if (headerKey) {
    return headerKey;
  }

  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("ApiKey ")) {
    return authHeader.slice("ApiKey ".length);
  }

  return null;
}

export async function authenticateServiceRequest(req: Request): Promise<ServiceKeyIdentity | null> {
  const key = getServiceApiKey(req);
  if (!key) {
    return null;
  }

  const match = loadServiceKeys().find((serviceKey) => serviceKey.key === key);
  if (match) {
    const { key: _key, ...identity } = match;
    return {
      ...identity,
      source: "env",
    };
  }

  const persistentMatch = await findPersistentServiceKeyByRawKey(key);
  if (!persistentMatch) {
    throw new UnauthorizedError("Invalid API key");
  }

  return {
    ...persistentMatch,
    source: "file",
  };
}

export function assertServiceScope(
  service: ServiceKeyIdentity | null | undefined,
  scope: string,
) {
  if (!service) {
    throw new UnauthorizedError("Service authentication required");
  }

  if (!service.scopes.includes(scope) && !service.scopes.includes("*")) {
    throw new UnauthorizedError(`Missing scope: ${scope}`);
  }
}

export const createServiceKeySchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).min(1),
  tenantId: z.string().trim().min(1).optional(),
  deprecatedAt: z.string().datetime().optional(),
});

export const rotateServiceKeySchema = z.object({
  id: z.string().trim().min(1),
  deprecatedAt: z.string().datetime().optional(),
});

export const revokeServiceKeySchema = z.object({
  id: z.string().trim().min(1),
});

export function createServiceKey(input: {
  name: string;
  scopes: string[];
  tenantId?: string;
  deprecatedAt?: string;
}) {
  return createPersistentServiceKey(input);
}

export function rotateServiceKey(input: {
  id: string;
  tenantId?: string | null;
  deprecatedAt?: string;
}) {
  return rotatePersistentServiceKey(input).then((rotated) => {
    if (!rotated) {
      throw new NotFoundError("Service key not found");
    }
    return rotated;
  });
}

export function revokeServiceKey(id: string, tenantId?: string | null) {
  return revokePersistentServiceKey(id, tenantId).then((revoked) => {
    if (!revoked) {
      throw new NotFoundError("Service key not found");
    }
    return revoked;
  });
}
