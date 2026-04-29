import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, presentersMock } = vi.hoisted(() => ({
  dbMock: {
    game: {
      findMany: vi.fn(),
    },
    jam: {
      findUnique: vi.fn(),
    },
    ratingCategory: {
      findMany: vi.fn(),
    },
    rating: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
  presentersMock: {
    materializeGameListingEntries: vi.fn((game) => [
      {
        ...game,
        pageVersion: "JAM",
        ratings: game.ratings ?? [],
        team: game.team ?? { users: [] },
      },
    ]),
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../features/games/presenters.js", () => ({
  materializeGameListingEntries: presentersMock.materializeGameListingEntries,
}));

import { listGames } from "../features/games/listing.service.js";

describe("game listing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates basic listing sorts with a cursor-shaped response", async () => {
    dbMock.game.findMany.mockResolvedValueOnce([
      { id: 9, pages: [], ratings: [], ratingCategories: [], team: { users: [] } },
      { id: 8, pages: [], ratings: [], ratingCategories: [], team: { users: [] } },
    ]);

    const result = await listGames({
      sort: "newest",
      pageVersion: "JAM",
      limit: "1",
    });

    expect(dbMock.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        orderBy: { id: "desc" },
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.pageInfo).toEqual({
      hasMore: true,
      nextCursor: "9",
      limit: 1,
    });
  });

  it("resolves a jam slug before filtering the public listing", async () => {
    dbMock.jam.findUnique.mockResolvedValueOnce({ id: 12, slug: "third-edition" });
    dbMock.game.findMany.mockResolvedValueOnce([]);

    await listGames({
      sort: "newest",
      jamSlug: "third-edition",
      pageVersion: "JAM",
      limit: "24",
    });

    expect(dbMock.jam.findUnique).toHaveBeenCalledWith({
      where: { slug: "third-edition" },
      select: {
        id: true,
        slug: true,
      },
    });
    expect(dbMock.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          published: true,
          jamId: 12,
        }),
      }),
    );
  });
});
