import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      findUnique: vi.fn(),
    },
    jam: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    game: {
      findFirst: vi.fn(),
    },
    gamePage: {
      findFirst: vi.fn(),
    },
    data: {
      findMany: vi.fn(),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { ForbiddenError, NotFoundError, UnauthorizedError } from "../src/lib/errors.js";
import { getRecapVisibility, updateRecapVisibility } from "../src/features/recap";

describe("recap service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates recap visibility state and returns a share path", async () => {
    dbMock.jam.findUnique.mockResolvedValueOnce({ id: 2, slug: "third-edition" });
    dbMock.game.findFirst.mockResolvedValue({ id: 7 });
    dbMock.gamePage.findFirst.mockResolvedValue({ id: 8 });
    dbMock.data.findMany.mockResolvedValue([]);

    const result = await updateRecapVisibility({
      jamSlug: "third-edition",
      isPublic: true,
      actor: { id: 1, slug: "ben" },
    });

    expect(result.sharePath).toBe("/recap/ben?jam=third-edition");
    expect(dbMock.data.create).toHaveBeenCalled();
  });

  it("loads recap visibility for the requested user and latest jam", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({
      id: 4,
      slug: "ben",
      teams: [
        {
          jamId: 3,
          game: {
            id: 10,
            jamId: 3,
            published: true,
          },
        },
      ],
    });
    dbMock.jam.findUnique.mockResolvedValueOnce({ id: 3, slug: "third-edition" });
    dbMock.gamePage.findFirst.mockResolvedValueOnce({ id: 11 });
    dbMock.data.findMany.mockResolvedValueOnce([
      {
        data: JSON.stringify({
          kind: "jam-recap-visibility",
          jamId: 3,
          isPublic: true,
        }),
      },
    ]);

    const result = await getRecapVisibility({
      userSlug: "ben",
      viewer: { slug: "ben" },
    });

    expect(result).toEqual({
      jamId: 3,
      jamSlug: "third-edition",
      isPublic: true,
      canEdit: true,
      sharePath: "/recap/ben?jam=third-edition",
    });
  });

  it("rejects recap lookups when no viewer or user slug is provided", async () => {
    await expect(
      getRecapVisibility({
        viewer: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects recap lookups for unknown users", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      getRecapVisibility({
        userSlug: "missing",
        viewer: { slug: "viewer" },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects users without a published game in the jam", async () => {
    dbMock.jam.findUnique.mockResolvedValueOnce({ id: 2, slug: "third-edition" });
    dbMock.game.findFirst.mockResolvedValue(null);

    await expect(
      updateRecapVisibility({
        jamSlug: "third-edition",
        isPublic: true,
        actor: { id: 1, slug: "ben" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

