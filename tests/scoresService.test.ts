import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    gamePageLeaderboard: {
      findMany: vi.fn(),
    },
    score: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import {
  createScore,
  deleteScore,
  listRecentTopScores,
} from "../src/features/scores";

describe("scores service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes evidence and applies decimal scaling for score leaderboards", async () => {
    dbMock.score.create.mockResolvedValueOnce({ id: 3 });

    await createScore({
      input: {
        score: 12.34,
        evidenceUrl: "https://example.com/run",
      },
      actor: { id: 7 },
      leaderboard: {
        id: 5,
        type: "SCORE",
        decimalPlaces: 2,
      },
    });

    expect(dbMock.score.create).toHaveBeenCalledWith({
      data: {
        evidence: "https://example.com/run",
        data: 1234,
        userId: 7,
        leaderboardId: 5,
      },
    });
  });

  it("deletes scores by id", async () => {
    dbMock.score.delete.mockResolvedValueOnce({});

    await deleteScore(9);

    expect(dbMock.score.delete).toHaveBeenCalledWith({
      where: { id: 9 },
    });
  });

  it("keeps qualifying scores unique by user and game with fallback", async () => {
    const users = ["Alice", "Bob", "Carol", "Dave"].map((name, index) => ({
      id: index + 1,
      slug: name.toLowerCase(),
      name,
      profilePicture: null,
    }));
    const recentScore = ({
      id,
      userIndex,
      leaderboardId,
      gameId,
      data,
      scoredAt,
    }: {
      id: number;
      userIndex: number;
      leaderboardId: number;
      gameId: number;
      data: number;
      scoredAt: string;
    }) => ({
      id,
      data,
      evidence: "",
      updatedAt: new Date(scoredAt),
      user: users[userIndex],
      leaderboard: {
        id: leaderboardId,
        name: `Leaderboard ${leaderboardId}`,
        type: "SCORE",
        decimalPlaces: 0,
        onlyBest: true,
        gamePage: {
          version: "JAM",
          name: `Game ${gameId}`,
          thumbnail: null,
          game: { id: gameId, slug: `game-${gameId}` },
        },
      },
    });
    const standing = (
      id: number,
      userId: number,
      data: number,
      minute = id % 60,
    ) => ({
      id,
      userId,
      data,
      updatedAt: new Date(`2026-09-09T10:${String(minute).padStart(2, "0")}:00Z`),
    });

    dbMock.score.findMany.mockResolvedValue([
      recentScore({
        id: 1,
        userIndex: 0,
        leaderboardId: 1,
        gameId: 1,
        data: 90,
        scoredAt: "2026-09-09T14:00:00Z",
      }),
      recentScore({
        id: 2,
        userIndex: 1,
        leaderboardId: 1,
        gameId: 1,
        data: 100,
        scoredAt: "2026-09-09T13:00:00Z",
      }),
      recentScore({
        id: 3,
        userIndex: 0,
        leaderboardId: 2,
        gameId: 2,
        data: 80,
        scoredAt: "2026-09-09T12:00:00Z",
      }),
      recentScore({
        id: 4,
        userIndex: 2,
        leaderboardId: 3,
        gameId: 3,
        data: 97,
        scoredAt: "2026-09-09T11:00:00Z",
      }),
      recentScore({
        id: 5,
        userIndex: 3,
        leaderboardId: 4,
        gameId: 4,
        data: 17,
        scoredAt: "2026-09-09T10:00:00Z",
      }),
    ]);
    dbMock.gamePageLeaderboard.findMany.mockResolvedValue([
      {
        id: 1,
        type: "SCORE",
        onlyBest: true,
        scores: [standing(2, 2, 100), standing(1, 1, 90), standing(6, 6, 80)],
      },
      {
        id: 2,
        type: "SCORE",
        onlyBest: true,
        scores: [standing(7, 7, 100), standing(8, 8, 90), standing(3, 1, 80)],
      },
      {
        id: 3,
        type: "SCORE",
        onlyBest: true,
        scores: Array.from({ length: 40 }, (_, index) =>
          standing(index === 3 ? 4 : 100 + index, 100 + index, 100 - index),
        ),
      },
      {
        id: 4,
        type: "SCORE",
        onlyBest: true,
        scores: Array.from({ length: 20 }, (_, index) =>
          standing(index === 3 ? 5 : 200 + index, 200 + index, 20 - index),
        ),
      },
    ]);

    const result = await listRecentTopScores(null);

    expect(result.map((score) => score.id)).toEqual([2, 3, 4]);
    expect(new Set(result.map((score) => score.user.id)).size).toBe(result.length);
    expect(new Set(result.map((score) => score.game.id)).size).toBe(result.length);
  });
});

