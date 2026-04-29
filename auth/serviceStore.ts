import { randomUUID } from "node:crypto";

import {
  createPersistentServiceKeyInDb,
  findPersistentServiceKeyByRawKeyInDb,
  listPersistentServiceKeysFromDb,
  listPersistentServiceKeysFromDbForTenant,
  revokePersistentServiceKeyInDb,
  rotatePersistentServiceKeyInDb,
} from "../infra/platformStore.js";

export type PersistentServiceKeyRecord = {
  id: string;
  name: string;
  scopes: string[];
  tenantId?: string;
  createdAt: string;
  deprecatedAt?: string;
  revokedAt?: string;
  keyHash: string;
};

export function listPersistentServiceKeys(tenantId?: string | null) {
  return listPersistentServiceKeysFromDbForTenant(tenantId);
}

export function findPersistentServiceKeyByRawKey(key: string) {
  return findPersistentServiceKeyByRawKeyInDb(key);
}

export function createPersistentServiceKey(input: {
  name: string;
  scopes: string[];
  tenantId?: string;
  deprecatedAt?: string;
}) {
  const id = randomUUID();
  return createPersistentServiceKeyInDb({
    id,
    ...input,
  }).then((created) => ({
    key: created.rawKey,
    service: {
      id,
      name: input.name,
      scopes: input.scopes,
      tenantId: input.tenantId,
      deprecatedAt: input.deprecatedAt,
      createdAt: new Date().toISOString(),
      keyHash: "",
      keyPrefix: created.keyPrefix,
      usageCount: 0,
    } as PersistentServiceKeyRecord,
  }));
}

export function rotatePersistentServiceKey(input: {
  id: string;
  tenantId?: string | null;
  deprecatedAt?: string;
}) {
  return rotatePersistentServiceKeyInDb(input).then(async (rotated) => {
    if (!rotated) {
      return null;
    }
    const records = await listPersistentServiceKeys(input.tenantId);
    const updated = records.find((record) => record.id === input.id);
    return updated
      ? {
          key: rotated.rawKey,
          service: updated,
        }
      : null;
  });
}

export function revokePersistentServiceKey(id: string, tenantId?: string | null) {
  return revokePersistentServiceKeyInDb(id, tenantId).then(async (revoked) => {
    if (!revoked) {
      return null;
    }
    const records = await listPersistentServiceKeys(tenantId);
    return records.find((record) => record.id === id) ?? null;
  });
}
