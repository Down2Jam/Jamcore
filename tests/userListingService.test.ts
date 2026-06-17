import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { listUsers } from "../src/features/users/discovery.service.js";

describe("user listing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated users", async () => {
    dbMock.user.findMany.mockResolvedValueOnce([
      { id: 5, name: "A", slug: "a", profilePicture: null, teams: [] },
      { id: 4, name: "B", slug: "b", profilePicture: null, teams: [] },
    ]);

    const result = await listUsers({ limit: 1 });

    expect(dbMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
      }),
    );
    expect(result.pageInfo).toEqual({
      hasMore: true,
      nextCursor: "5",
      limit: 1,
    });
  });
});
