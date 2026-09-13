import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: {
  gamePage: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  gamePageTrack: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  gamePageLeaderboard: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
  score: { delete: vi.fn() },
} }));

vi.mock("../src/infra/db.js", () => ({ default: db }));
vi.mock("../src/features/games/web-build.service.js", () => ({
  attachWebBuildToPage: vi.fn(),
  scheduleWebBuildDeletionIfUnreferenced: vi.fn(),
  webBuildIdFromUrl: () => null,
}));

import { upsertGamePage } from "../src/features/games/page.write.service.js";
import { postJamPageInclude } from "../src/features/games/page.read.js";
import { gamePageInclude } from "../src/features/games/page.helpers.js";

const songs = ["second", "first"].map(slug => ({ name: slug, slug, url: `/api/v1/music/${slug}.mp3`, composerId: 1 }));
const leaderboards = [2, 1].map(id => ({ id, name: `Board ${id}`, type: "SCORE" as const, onlyBest: true }));

describe("game page item ordering", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.gamePage.findFirst.mockResolvedValue({ id: 10, playableBuildId: null });
    db.gamePage.create.mockResolvedValue({ id: 10 });
    db.gamePageTrack.findMany.mockResolvedValue([]);
    db.gamePageLeaderboard.findMany.mockResolvedValue([]);
  });

  it.each(["JAM", "POST_JAM"] as const)("reorders existing %s items without recreating tracks or deleting scores", async version => {
    db.gamePageTrack.findMany.mockResolvedValue([
      { id: 11, slug: "first", ratings: [{ id: 1 }], timestampComments: [{ id: 2 }] },
      { id: 12, slug: "second", ratings: [], timestampComments: [] },
    ]);
    db.gamePageLeaderboard.findMany.mockResolvedValue([
      { id: 1, scores: [{ id: 3 }] }, { id: 2, scores: [{ id: 4 }] },
    ]);
    await upsertGamePage(1, version, { songs, leaderboards });
    expect(db.gamePageTrack.update.mock.calls.map(([arg]) => [arg.where.id, arg.data.sortOrder])).toEqual([[12, 0], [11, 1]]);
    expect(db.gamePageLeaderboard.update.mock.calls.map(([arg]) => [arg.where.id, arg.data.sortOrder])).toEqual([[2, 0], [1, 1]]);
    expect(db.gamePageTrack.create).not.toHaveBeenCalled();
    expect(db.gamePageTrack.delete).not.toHaveBeenCalled();
    expect(db.gamePageLeaderboard.create).not.toHaveBeenCalled();
    expect(db.gamePageLeaderboard.delete).not.toHaveBeenCalled();
    expect(db.score.delete).not.toHaveBeenCalled();
  });

  it("assigns positions to new items on an existing page", async () => {
    await upsertGamePage(1, "JAM", { songs, leaderboards });
    expect(db.gamePageTrack.create.mock.calls.map(([arg]) => [arg.data.slug, arg.data.sortOrder])).toEqual([["second", 0], ["first", 1]]);
    expect(db.gamePageLeaderboard.create.mock.calls.map(([arg]) => [arg.data.name, arg.data.sortOrder])).toEqual([["Board 2", 0], ["Board 1", 1]]);
  });

  it("preserves array order when creating a post-jam page", async () => {
    db.gamePage.findFirst.mockResolvedValue(null);
    await upsertGamePage(1, "POST_JAM", { songs, leaderboards });
    const created = db.gamePage.create.mock.calls[0][0].data.tracks.create;
    expect(created.map((track: { slug: string; sortOrder: number }) => [track.slug, track.sortOrder])).toEqual([["second", 0], ["first", 1]]);
    expect(db.gamePageLeaderboard.create.mock.calls.map(([arg]) => arg.data.sortOrder)).toEqual([0, 1]);
  });

  it("requests the saved order with a stable tie-breaker for game page reads", () => {
    for (const include of [gamePageInclude, postJamPageInclude]) {
      expect(include.tracks.orderBy).toEqual([{ sortOrder: "asc" }, { id: "asc" }]);
      expect(include.leaderboards.orderBy).toEqual([{ sortOrder: "asc" }, { id: "asc" }]);
    }
  });
});
