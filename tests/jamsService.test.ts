import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    jam: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import {
  clearJamServiceCaches,
  checkJamParticipation,
  getCurrentActiveJam,
  hasUserJoinedJam,
  joinJam,
  listJams,
} from "../features/jams";
import { JAM_PHASES } from "../domain/jamTimeline.js";

describe("jams service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearJamServiceCaches();
  });

  it("returns only jams whose start time is in the past", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    dbMock.jam.findMany.mockResolvedValueOnce([
      { id: 3, slug: "future-jam", startTime: future },
      { id: 2, slug: "past-jam", startTime: past },
    ]);

    const result = await listJams();

    expect(dbMock.jam.findMany).toHaveBeenCalledWith({
      take: 10,
      orderBy: { id: "desc" },
    });
    expect(result).toEqual([{ id: 2, slug: "past-jam", startTime: past }]);
  });

  it("checks whether a user has joined a jam", async () => {
    dbMock.jam.findFirst = vi.fn().mockResolvedValueOnce({ id: 3 });

    const result = await hasUserJoinedJam({
      jamId: 3,
      userSlug: "ben",
    });

    expect(dbMock.jam.findFirst).toHaveBeenCalledWith({
      where: {
        id: 3,
        users: {
          some: {
            slug: "ben",
          },
        },
      },
    });
    expect(result).toBe(true);
  });

  it("connects a user to a jam when they have not joined yet", async () => {
    dbMock.jam.update = vi.fn().mockResolvedValueOnce({});

    await joinJam({
      jamId: 3,
      userId: 5,
      alreadyJoined: false,
    });

    expect(dbMock.jam.update).toHaveBeenCalledWith({
      where: {
        id: 3,
      },
      data: {
        users: {
          connect: {
            id: 5,
          },
        },
      },
    });
  });

  it("returns the current active jam with phase metadata", async () => {
    const activeStartTime = new Date(Date.now() - 30 * 60 * 1000);

    dbMock.jam.findMany.mockResolvedValueOnce([
      {
        id: 2,
        slug: "spring-jam",
        isActive: true,
        startTime: activeStartTime,
        suggestionHours: 1,
        slaughterHours: 1,
        votingHours: 1,
        jammingHours: 24,
        submissionHours: 1,
        ratingHours: 24,
        postJamRefinementHours: 24,
        postJamRatingHours: 24,
        users: [],
        games: [],
      },
    ]);

    const result = await getCurrentActiveJam();

    expect(result).toEqual(
      expect.objectContaining({
        jam: expect.objectContaining({ id: 2 }),
        phase: expect.any(String),
      }),
    );
  });

  it("caches the active jam lookup for repeated reads", async () => {
    const activeStartTime = new Date(Date.now() - 30 * 60 * 1000);

    dbMock.jam.findMany.mockResolvedValueOnce([
      {
        id: 5,
        slug: "summer-jam",
        isActive: true,
        startTime: activeStartTime,
        suggestionHours: 1,
        slaughterHours: 1,
        votingHours: 1,
        jammingHours: 24,
        submissionHours: 1,
        ratingHours: 24,
        postJamRefinementHours: 24,
        postJamRatingHours: 24,
        themePerUser: 3,
        users: [],
        games: [],
      },
    ]);

    const first = await getCurrentActiveJam();
    const second = await getCurrentActiveJam();

    expect(first).toEqual(second);
    expect(dbMock.jam.findMany).toHaveBeenCalledTimes(1);
  });

  it("blocks participation when the user has not joined the active jam", async () => {
    const activeStartTime = new Date(Date.now() - 30 * 60 * 1000);

    dbMock.jam.findMany.mockResolvedValueOnce([
      {
        id: 2,
        slug: "autumn-jam",
        isActive: true,
        startTime: activeStartTime,
        suggestionHours: 1,
        slaughterHours: 1,
        votingHours: 1,
        jammingHours: 24,
        submissionHours: 1,
        ratingHours: 24,
        postJamRefinementHours: 24,
        postJamRatingHours: 24,
        users: [],
        games: [],
      },
    ]);
    dbMock.jam.findUnique.mockResolvedValueOnce({
      users: [{ slug: "someone-else" }],
    });

    const next = vi.fn();
    await checkJamParticipation(
      {} as any,
      { locals: { userSlug: "ben" } } as any,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "You must join the jam first to participate.",
      }),
    );
  });
});

