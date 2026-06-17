import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignCoreEntityTenant: vi.fn(),
  doesCoreEntityBelongToTenant: vi.fn(),
  filterCoreEntityIdsByTenant: vi.fn(),
  listCoreEntitiesByTenant: vi.fn(),
  db: {
    user: { findMany: vi.fn() },
    jam: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    game: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
  },
}));

vi.mock("../src/infra/coreTenantStore.js", () => ({
  assignCoreEntityTenant: mocks.assignCoreEntityTenant,
  doesCoreEntityBelongToTenant: mocks.doesCoreEntityBelongToTenant,
  filterCoreEntityIdsByTenant: mocks.filterCoreEntityIdsByTenant,
  listCoreEntitiesByTenant: mocks.listCoreEntitiesByTenant,
}));

vi.mock("../src/infra/db.js", () => ({
  default: mocks.db,
}));

import {
  importTenantSnapshot,
  importTenantSnapshotSchema,
} from "../src/features/platform/tenant-admin.service.js";

describe("tenant admin imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.user.findMany.mockResolvedValue([]);
    mocks.db.jam.findMany.mockResolvedValue([]);
    mocks.db.team.findMany.mockResolvedValue([]);
    mocks.db.game.findMany.mockResolvedValue([]);
    mocks.db.post.findMany.mockResolvedValue([]);
    mocks.filterCoreEntityIdsByTenant.mockImplementation(async ({ ids }) => ids);
  });

  it("rejects snapshot IDs that already belong to another tenant", async () => {
    mocks.db.user.findMany.mockResolvedValueOnce([{ id: 42 }]);
    mocks.filterCoreEntityIdsByTenant.mockImplementation(async ({ ids }) =>
      ids.includes(42) ? [] : ids,
    );

    const input = importTenantSnapshotSchema.parse({
      mode: "validate",
      snapshot: {
        tenantId: "tenant-a",
        users: [{ id: 42, slug: "alice", name: "Alice" }],
      },
    });

    const result = await importTenantSnapshot(input);

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("User 42 already exists outside tenant tenant-a");
  });
});
