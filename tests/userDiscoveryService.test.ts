import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import {
  listUsers,
  searchUsers,
} from "../features/users/discovery.service.js";

describe("user discovery service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists users with the profile card projection", async () => {
    dbMock.user.findMany.mockResolvedValueOnce([]);

    await listUsers();

    expect(dbMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: "desc" },
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          profilePicture: true,
        }),
      }),
    );
  });

  it("searches users by name or slug", async () => {
    dbMock.user.findMany.mockResolvedValueOnce([]);

    await searchUsers("ben");

    expect(dbMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: "ben", mode: "insensitive" } },
            { slug: { contains: "ben", mode: "insensitive" } },
          ],
        },
        take: 5,
      }),
    );
  });
});

