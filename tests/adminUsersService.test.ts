import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import { BadRequestError, ForbiddenError } from "../lib/errors.js";
import { updateUserRole } from "../features/admin-users";

describe("admin users service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes a user to admin", async () => {
    const message = await updateUserRole({
      actor: { id: 1, admin: true, createdAt: new Date("2026-01-01") },
      targetUser: { id: 2, admin: false, createdAt: new Date("2026-02-01") },
      mod: false,
      admin: true,
    });

    expect(message).toBe("Target user has been promoted to admin.");
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { admin: true, mod: true },
    });
  });

  it("rejects non-admin actors and duplicate admin promotion", async () => {
    await expect(
      updateUserRole({
        actor: { id: 1, admin: false, createdAt: new Date() },
        targetUser: { id: 2, admin: false, createdAt: new Date() },
        mod: false,
        admin: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      updateUserRole({
        actor: { id: 1, admin: true, createdAt: new Date() },
        targetUser: { id: 2, admin: true, createdAt: new Date() },
        mod: false,
        admin: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

