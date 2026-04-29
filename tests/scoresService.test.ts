import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    score: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import { createScore, deleteScore } from "../features/scores";

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
});

