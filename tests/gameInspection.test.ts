import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ games: vi.fn(), jam: vi.fn(), current: vi.fn(), tenant: vi.fn() }));
vi.mock("../src/infra/db.js", () => ({ default: { game: { findMany: mocks.games }, jam: { findUnique: mocks.jam } } }));
vi.mock("../src/features/jams/index.js", () => ({ getCurrentActiveJam: mocks.current }));
vi.mock("../src/infra/coreTenantStore.js", () => ({ filterCoreEntityIdsByTenant: mocks.tenant }));
import { canReadGame, canInspectUnpublishedGames } from "../src/features/games/inspection.policy.js";
import { listCurrentJamGames } from "../src/features/games/inspection.service.js";

const owner = { id: 1, slug: "ategon", admin: true };
describe("unpublished game inspection", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("keeps team access while allowing only the named admin to inspect", () => {
    const game = { published: false, team: { users: [{ id: 2 }] } };
    expect(canReadGame(game, { id: 2 })).toBe(true);
    expect(canReadGame(game, owner)).toBe(true);
    for (const user of [null, { id: 3 }, { id: 3, admin: true, slug: "other" }, { id: 1, slug: "ategon", admin: false }]) {
      expect(canReadGame(game, user)).toBe(false);
      expect(canInspectUnpublishedGames(user)).toBe(false);
    }
    expect(canReadGame({ ...game, published: true }, null)).toBe(true);
  });
  it("rejects other admins before querying games", async () => {
    await expect(listCurrentJamGames({ id: 3, slug: "other", admin: true })).rejects.toThrow("Not allowed");
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.games).not.toHaveBeenCalled();
  });
  it("lists current-jam games of both publication states within the tenant", async () => {
    mocks.current.mockResolvedValue({ jam: { id: 7 } });
    mocks.jam.mockResolvedValue({ id: 7, name: "Current", slug: "current" });
    mocks.tenant.mockResolvedValue([1, 2]);
    mocks.games.mockResolvedValue([
      { id: 1, slug: "draft", published: false, pages: [{ version: "JAM", name: "Draft", description: "Hello", playableBuildUrl: "/build", _count: { tracks: 2, downloadLinks: 0 } }] },
      { id: 2, slug: "public", published: true, pages: [] },
      { id: 3, slug: "other-tenant", published: false, pages: [] },
    ]);
    const result = await listCurrentJamGames(owner, "tenant-a");
    expect(mocks.games).toHaveBeenCalledWith(expect.objectContaining({ where: { jamId: 7 } }));
    expect(result.games.map((game) => game.id)).toEqual([1, 2]);
    expect(result.games[0]).toMatchObject({ published: false, hasBuild: true, trackCount: 2, hasThumbnail: false });
    expect(result.games[0]).not.toHaveProperty("pages");
  });
  it("handles no current jam", async () => {
    mocks.current.mockResolvedValue(null);
    expect(await listCurrentJamGames(owner)).toEqual({ jam: null, games: [] });
    expect(mocks.games).not.toHaveBeenCalled();
  });
});
