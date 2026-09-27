import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, activeJam, broadcast } = vi.hoisted(() => ({
  db: {
    radioSession: { findUnique: vi.fn(), upsert: vi.fn() },
    radioBan: { findMany: vi.fn() },
    gamePageTrack: { findMany: vi.fn() },
    radioVote: { groupBy: vi.fn(), upsert: vi.fn() },
    radioEmote: { findMany: vi.fn(), deleteMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  activeJam: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock("../src/infra/db.js", () => ({ default: db }));
vi.mock("../src/features/jams/service.js", () => ({ getCurrentActiveJam: activeJam }));
vi.mock("../src/infra/coreTenantStore.js", () => ({
  filterCoreEntityIdsByTenant: vi.fn(async ({ ids }) => ids),
}));
vi.mock("../src/features/radio/events.js", () => ({
  broadcastRadioEvent: broadcast,
  getRadioListenerCount: () => 0,
}));

import { advanceRadioIfNeeded, getRadioState, saveRadioVote } from "../src/features/radio/service.js";

function track(id: number, jamId: number, safe = true) {
  return {
    id, slug: `track-${id}`, url: `https://example.com/${id}.mp3`,
    allowBackgroundUse: safe, allowDownload: true,
    gamePage: { version: "JAM", gameId: id, game: { id, jamId, published: true } },
  };
}

let tracks: ReturnType<typeof track>[];
let session: any;

beforeEach(() => {
  vi.clearAllMocks();
  tracks = [track(1, 10), track(2, 20), track(3, 20), track(4, 20, false)];
  session = null;
  activeJam.mockResolvedValue({ phase: "Submission", jam: { id: 20 } });
  db.radioSession.findUnique.mockImplementation(async () => session);
  db.radioSession.upsert.mockImplementation(async ({ create, update }) => {
    session = session ? { ...session, ...update } : create;
    return session;
  });
  db.gamePageTrack.findMany.mockImplementation(async ({ where }) => {
    if (where.id) return tracks.filter((track) => where.id.in.includes(track.id));
    const jamId = where.gamePage.game.jamId;
    return tracks.filter((track) => jamId == null || track.gamePage.game.jamId === jamId);
  });
  db.radioBan.findMany.mockResolvedValue([]);
  db.radioVote.groupBy.mockResolvedValue([]);
  db.radioEmote.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

describe("radio jam scope", () => {
  it.each(["Submission", "Rating"])("only plays and queues the active jam during %s", async (phase) => {
    activeJam.mockResolvedValue({ phase, jam: { id: 20 } });
    const state = await getRadioState({ tenantId: "test" });
    expect(state.current?.track.id).not.toBe(1);
    expect(state.voting.options.map(({ track }) => track.id)).not.toContain(1);
    expect(activeJam).toHaveBeenCalledWith("test");
  });

  it("keeps the safe station background-use restriction", async () => {
    const state = await getRadioState({ tenantId: "test", station: "safe" });
    expect([state.current?.track.id, ...state.voting.options.map(({ track }) => track.id)].sort()).toEqual([2, 3]);
    expect(session.tenantId).toBe("test:radio:safe");
  });

  it("replaces an already playing site track at a phase transition", async () => {
    activeJam.mockResolvedValue({ phase: "Jamming", jam: { id: 20 } });
    tracks = [track(1, 10)];
    await getRadioState({ tenantId: "test" });
    tracks.push(track(2, 20));
    activeJam.mockResolvedValue({ phase: "Submission", jam: { id: 20 } });
    await advanceRadioIfNeeded("test");
    expect(session.currentTrackId).toBe(2);
    expect(broadcast).toHaveBeenCalledWith("test", expect.objectContaining({ type: "state" }));
  });

  it("rejects old vote options while preserving an eligible current track", async () => {
    await getRadioState({ tenantId: "test" });
    session.currentTrackId = 2;
    session.voteOptions = [1, 3];
    const startedAt = session.startedAt;
    await expect(saveRadioVote({
      tenantId: "test", actor: { id: 1, slug: "user", name: "User" },
      input: { trackId: 1, station: "all" },
    })).rejects.toThrow("Track is not a current vote option");
    expect(session.currentTrackId).toBe(2);
    expect(session.startedAt).toBe(startedAt);
    expect(session.voteOptions).not.toContain(1);
    expect(db.radioVote.upsert).not.toHaveBeenCalled();
  });

  it("clears playback when the jam has no tracks, then resumes when one arrives", async () => {
    tracks = [track(1, 10)];
    const empty = await getRadioState({ tenantId: "test" });
    expect(empty.current).toBeNull();
    expect(empty.voting.options).toEqual([]);
    expect(await advanceRadioIfNeeded("test")).toBe(false);
    tracks.push(track(2, 20));
    expect((await getRadioState({ tenantId: "test" })).current?.track.id).toBe(2);
  });

  it("uses site music outside submission and rating", async () => {
    activeJam.mockResolvedValue({ phase: "Jamming", jam: { id: 20 } });
    const state = await getRadioState({ tenantId: "test" });
    expect([state.current?.track.id, ...state.voting.options.map(({ track }) => track.id)]).toContain(1);
  });
});
