import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ games: vi.fn(), links: vi.fn(), tenantIds: vi.fn() }));
vi.mock("../src/infra/db.js", () => ({ default: { game: { findMany: mocks.games }, postGameLink: { findMany: mocks.links } } }));
vi.mock("../src/infra/coreTenantStore.js", () => ({ filterCoreEntityIdsByTenant: mocks.tenantIds }));

import { listLinkableGames, loadLinkedGames, validatePostGames } from "../src/features/posts/linked-games.service.js";

const game = { id: 7, slug: "my-game", pages: [{ version: "JAM", name: "My game", thumbnail: "jam.png" }] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.games.mockResolvedValue([game]);
  mocks.links.mockResolvedValue([]);
  mocks.tenantIds.mockImplementation(async ({ ids }) => ids);
});

describe("post game links", () => {
  it("limits candidates to published games owned or contributed to by the author", async () => {
    expect(await listLinkableGames(12)).toEqual([{ gameId: 7, slug: "my-game", name: "My game", thumbnail: "jam.png" }]);
    expect(mocks.games).toHaveBeenCalledWith(expect.objectContaining({ where: {
      published: true, team: { OR: [{ ownerId: 12 }, { users: { some: { id: 12 } } }] },
    } }));
  });
  it("rejects linking another creator's or an unpublished game", async () => {
    await expect(validatePostGames(12, [{ gameId: 99 }])).rejects.toThrow("only link published games");
    await expect(validatePostGames(12, [{ gameId: 7 }])).resolves.toBeUndefined();
  });
  it("excludes games belonging to another tenant", async () => {
    mocks.tenantIds.mockResolvedValue([]);
    expect(await listLinkableGames(12, "tenant-a")).toEqual([]);
    await expect(validatePostGames(12, [{ gameId: 7 }], "tenant-a")).rejects.toThrow();
  });
  it("allows clearing or leaving links unchanged without requiring any games", async () => {
    await validatePostGames(12, []);
    await validatePostGames(12, undefined);
    expect(mocks.games).not.toHaveBeenCalled();
  });
  it("loads links for a feed in a batch and falls back to the jam page", async () => {
    mocks.links.mockResolvedValue([{ postId: 1, gameId: 7, relationType: "devlog" }, { postId: 2, gameId: 7, relationType: "release" }, { postId: 2, gameId: 99, relationType: "other" }]);
    const result = await loadLinkedGames([1, 2]);
    expect(result.get(1)).toEqual([{ gameId: 7, slug: "my-game", name: "My game", thumbnail: "jam.png", relationType: "devlog" }]);
    expect(result.get(2)).toHaveLength(1);
    expect(mocks.games).toHaveBeenCalledTimes(1);
    expect(mocks.games).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [7, 7, 99] }, published: true } }));
  });
  it("prefers the post-jam page when both versions exist", async () => {
    mocks.games.mockResolvedValue([{ ...game, pages: [...game.pages, { version: "POST_JAM", name: "Updated game", thumbnail: "updated.png" }] }]);
    expect((await listLinkableGames(12))[0].name).toBe("Updated game");
  });
});
