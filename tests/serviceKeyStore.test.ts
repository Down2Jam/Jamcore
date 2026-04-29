import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPersistentServiceKeyInDbMock,
  listPersistentServiceKeysFromDbMock,
  listPersistentServiceKeysFromDbForTenantMock,
  revokePersistentServiceKeyInDbMock,
  rotatePersistentServiceKeyInDbMock,
} = vi.hoisted(() => ({
  createPersistentServiceKeyInDbMock: vi.fn(),
  listPersistentServiceKeysFromDbMock: vi.fn(),
  listPersistentServiceKeysFromDbForTenantMock: vi.fn(),
  revokePersistentServiceKeyInDbMock: vi.fn(),
  rotatePersistentServiceKeyInDbMock: vi.fn(),
}));

vi.mock("../infra/platformStore.js", () => ({
  createPersistentServiceKeyInDb: createPersistentServiceKeyInDbMock,
  listPersistentServiceKeysFromDb: listPersistentServiceKeysFromDbMock,
  listPersistentServiceKeysFromDbForTenant: listPersistentServiceKeysFromDbForTenantMock,
  revokePersistentServiceKeyInDb: revokePersistentServiceKeyInDbMock,
  rotatePersistentServiceKeyInDb: rotatePersistentServiceKeyInDbMock,
  findPersistentServiceKeyByRawKeyInDb: vi.fn(),
}));

import {
  createPersistentServiceKey,
  listPersistentServiceKeys,
  revokePersistentServiceKey,
  rotatePersistentServiceKey,
} from "../auth/serviceStore.js";

describe("service key store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates, rotates, and revokes persistent service keys", async () => {
    createPersistentServiceKeyInDbMock.mockResolvedValue({
      rawKey: "jam_sk_created",
      keyPrefix: "jam_sk_creat",
    });
    rotatePersistentServiceKeyInDbMock.mockResolvedValue({
      rawKey: "jam_sk_rotated",
      keyPrefix: "jam_sk_rotat",
    });
    revokePersistentServiceKeyInDbMock.mockResolvedValue(true);

    const created = await createPersistentServiceKey({
      name: "worker",
      scopes: ["jobs:read"],
    });

    expect(created.key).toMatch(/^jam_sk_/);

    listPersistentServiceKeysFromDbForTenantMock.mockResolvedValueOnce([]);
    expect(await listPersistentServiceKeys()).toHaveLength(0);

    listPersistentServiceKeysFromDbForTenantMock.mockResolvedValueOnce([
      {
        id: created.service.id,
        name: "worker",
        scopes: ["jobs:read"],
        createdAt: new Date().toISOString(),
        keyHash: "hash",
        revokedAt: undefined,
      },
    ]);
    listPersistentServiceKeysFromDbMock.mockResolvedValueOnce([
      {
        id: created.service.id,
        name: "worker",
        scopes: ["jobs:read"],
        createdAt: new Date().toISOString(),
        keyHash: "hash",
        revokedAt: undefined,
      },
    ]);

    const rotated = await rotatePersistentServiceKey({
      id: created.service.id,
    });

    expect(rotated?.key).toMatch(/^jam_sk_/);
    expect(rotated?.key).not.toEqual(created.key);

    listPersistentServiceKeysFromDbForTenantMock.mockResolvedValueOnce([
      {
        id: created.service.id,
        name: "worker",
        scopes: ["jobs:read"],
        createdAt: new Date().toISOString(),
        keyHash: "hash",
        revokedAt: new Date().toISOString(),
      },
    ]);
    listPersistentServiceKeysFromDbMock.mockResolvedValueOnce([
      {
        id: created.service.id,
        name: "worker",
        scopes: ["jobs:read"],
        createdAt: new Date().toISOString(),
        keyHash: "hash",
        revokedAt: new Date().toISOString(),
      },
    ]);

    const revoked = await revokePersistentServiceKey(created.service.id);

    expect(revoked?.revokedAt).toEqual(expect.anything());
  });
});
