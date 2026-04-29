import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { platformStoreMock } = vi.hoisted(() => ({
  platformStoreMock: {
    listRoleGrantsFromDb: vi.fn(),
  },
}));

vi.mock("../infra/platformStore.js", () => platformStoreMock);

import { authorizationContext } from "../middleware/authorizationContext.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { requirePolicy } from "../middleware/requirePolicy.js";

function createResponseLocals(locals: Response["locals"] = {}) {
  return { locals } as Response;
}

function createGrant(role: string) {
  return {
    id: "grant-1",
    subjectType: "user",
    subjectId: "7",
    role,
    tenantId: "tenant-a",
    resourceType: null,
    resourceId: null,
    createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
    updatedAt: new Date("2026-01-01T00:00:00Z").toISOString(),
  };
}

function createNext() {
  return vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
}

describe("authorization middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformStoreMock.listRoleGrantsFromDb.mockResolvedValue([]);
  });

  it("reloads role grants after route-level user auth populates locals", async () => {
    const res = createResponseLocals({ tenantId: "tenant-a" });
    const next = createNext();

    await authorizationContext({} as Request, res, next);
    expect(res.locals.authorizationGrants).toEqual([]);

    res.locals.user = { id: 7, admin: false, mod: false } as Response["locals"]["user"];
    platformStoreMock.listRoleGrantsFromDb.mockResolvedValueOnce([
      createGrant("platform.admin"),
    ]);
    next.mockClear();

    await requirePolicy("platform.write")({} as Request, res, next);

    expect(platformStoreMock.listRoleGrantsFromDb).toHaveBeenLastCalledWith({
      subjectType: "user",
      subjectId: "7",
      tenantId: "tenant-a",
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("allows permission checks through platform role grants", async () => {
    const res = createResponseLocals({
      tenantId: "tenant-a",
      user: { id: 7, admin: false, mod: false } as Response["locals"]["user"],
    });
    const next = createNext();
    platformStoreMock.listRoleGrantsFromDb.mockResolvedValueOnce([
      createGrant("platform.reader"),
    ]);

    await requirePermission("service-keys:read")({} as Request, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
