import { beforeEach, describe, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: {
  $transaction: vi.fn(),
  game: { update: vi.fn() },
  gamePage: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  gamePageTrack: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  gamePageLeaderboard: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  score: { delete: vi.fn() },
} }));
vi.mock("../src/infra/db.js", () => ({ default: db }));
vi.mock("../src/features/games/web-build.service.js", () => ({ attachWebBuildToPage: vi.fn(), scheduleWebBuildDeletionIfUnreferenced: vi.fn(), webBuildIdFromUrl: () => null }));
import { upsertGamePage } from "../src/features/games/page.write.service.js";
import { gameAchievementSchema, updateGameSchema } from "../src/features/games/write.schemas.js";
import { reconcileMetadata } from "../src/lib/reconcileChildren.js";

const achievements = [{ id: 21, name: "Winner", description: "Win", image: "win.png" }, { id: 22, name: "Explorer", description: "Explore", image: "explore.png" }];
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.gamePage.findFirst.mockResolvedValue({ id: 10, playableBuildId: null, achievements, downloadLinks: [{ id: 31, url: "https://example.com/game", platform: "Web" }] });
  db.gamePageTrack.findMany.mockResolvedValue([]);
  db.gamePageLeaderboard.findMany.mockResolvedValue([]);
});

describe("stable game-page identities", () => {
  it.each(["JAM", "POST_JAM"] as const)("preserves achievement identities and ownership on repeated %s saves", async version => {
    for (let i = 0; i < 2; i++) await upsertGamePage(1, version, { achievements: achievements.map(item => gameAchievementSchema.parse(item)), playableBuildUrl: "/new-build" });
    for (const [call] of db.gamePage.update.mock.calls) {
      expect(call.data.achievements).toEqual({
        deleteMany: { id: { in: [] } }, create: [],
        update: achievements.map(({ id, ...data }) => ({ where: { id }, data })),
      });
      // In-place metadata updates never touch the users/unlocks relations.
      expect(call.data.achievements.update[0].data).not.toHaveProperty("unlocks");
      expect(call.data.achievements.update[0].data).not.toHaveProperty("users");
    }
  });
  it("creates new achievements and deletes only explicitly removed IDs", async () => {
    await upsertGamePage(1, "JAM", { achievements: [{ ...achievements[0], name: "Champion" }, { id: -1, name: "New" }] });
    expect(db.gamePage.update.mock.calls[0][0].data.achievements).toEqual({
      deleteMany: { id: { in: [22] } },
      update: [{ where: { id: 21 }, data: { name: "Champion", description: "Win", image: "win.png" } }],
      create: [{ name: "New", description: "", image: "" }],
    });
  });
  it("does not modify omitted collections on a build-only update", async () => {
    const body = updateGameSchema.parse({ name: "Game", slug: "game", category: "REGULAR", published: true, playableBuildUrl: "/game-builds/00000000-0000-0000-0000-000000000001/index.html" });
    await upsertGamePage(1, "JAM", body);
    const data = db.gamePage.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("achievements");
    expect(data).not.toHaveProperty("downloadLinks");
    expect(db.gamePageLeaderboard.findMany).not.toHaveBeenCalled();
    expect(db.gamePageTrack.findMany).not.toHaveBeenCalled();
  });
  it.each([{ incoming: [{ id: 99, name: "Foreign" }] }, { incoming: [achievements[0], achievements[0]] }])("rejects foreign/stale or duplicate IDs before changing achievements", async ({ incoming }) => {
    await expect(upsertGamePage(1, "JAM", { achievements: incoming })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.gamePage.update).not.toHaveBeenCalled();
  });
  it("treats an explicit empty list as removal", async () => {
    await upsertGamePage(1, "JAM", { achievements: [] });
    expect(db.gamePage.update.mock.calls[0][0].data.achievements.deleteMany).toEqual({ id: { in: [21, 22] } });
  });
  it("preserves download-link IDs when unchanged or editing the same platform", async () => {
    await upsertGamePage(1, "JAM", { downloadLinks: [{ url: "https://example.com/new-build", platform: "Web" }] });
    expect(db.gamePage.update.mock.calls[0][0].data.downloadLinks).toEqual({ create: [], deleteMany: { id: { in: [] } }, update: [{ where: { id: 31 }, data: { url: "https://example.com/new-build", platform: "Web" } }] });
  });
  it("renames tracks by ID without replacing ratings or comments", async () => {
    db.gamePageTrack.findMany.mockResolvedValue([{ id: 41, slug: "old", ratings: [{ id: 1 }], timestampComments: [{ id: 2 }], links: [], credits: [] }]);
    await upsertGamePage(1, "JAM", { songs: [{ id: 41, slug: "new", name: "Renamed", url: "/track", composerId: 1 }] });
    expect(db.gamePageTrack.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 41 }, data: expect.objectContaining({ slug: "new" }) }));
    expect(db.gamePageTrack.create).not.toHaveBeenCalled();
    expect(db.gamePageTrack.delete).not.toHaveBeenCalled();
  });
  it("keeps matching link and credit IDs, including reordered duplicate natural keys", () => {
    const links = [{ id: 1, label: "One", url: "same" }, { id: 2, label: "Two", url: "same" }];
    const result = reconcileMetadata(links, [{ label: "Two", url: "same" }, { label: "Edited", url: "same" }], item => item.url);
    expect(result.update.map(item => item.where.id)).toEqual([2, 1]);
    expect(result.create).toEqual([]);
    expect(result.deleteMany).toEqual({ id: { in: [] } });
    expect(reconcileMetadata([{ id: 3, role: "Composer", userId: 7 }], [{ role: "Music", userId: 7 }], item => String(item.userId)).update[0].where.id).toBe(3);
  });
});
