import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    gamePage: {
      findFirst: vi.fn(),
    },
    rating: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    },
    gamePageTrack: {
      findUnique: vi.fn(),
    },
    trackRatingCategory: {
      findUnique: vi.fn(),
    },
    trackRating: {
      findFirst: vi.fn(),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    },
    trackTimestampComment: {
      create: vi.fn(async () => ({ id: 8 })),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import {
  createTrackTimestampComment,
  saveGameRating,
  saveTrackRating,
} from "../features/ratings";

describe("ratings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates or updates a game rating", async () => {
    dbMock.gamePage.findFirst.mockResolvedValue({ id: 3 });
    dbMock.rating.findUnique.mockResolvedValue(null);

    await saveGameRating({
      gameId: 2,
      pageVersion: "JAM",
      categoryId: 5,
      value: 4,
      userId: 9,
    });

    expect(dbMock.rating.create).toHaveBeenCalledWith({
      data: {
        value: 4,
        gameId: 2,
        gamePageId: 3,
        userId: 9,
        categoryId: 5,
      },
    });
  });

  it("prevents rating your own track", async () => {
    dbMock.gamePageTrack.findUnique.mockResolvedValue({
      id: 4,
      gamePage: {
        game: {
          published: true,
          team: {
            users: [{ id: 9 }],
          },
        },
      },
    });
    dbMock.trackRatingCategory.findUnique.mockResolvedValue({ id: 2, name: "Overall" });

    await expect(
      saveTrackRating({
        trackId: 4,
        categoryId: 2,
        value: 5,
        userId: 9,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates track timestamp comments for published tracks", async () => {
    dbMock.gamePageTrack.findUnique.mockResolvedValue({
      id: 4,
      gamePage: {
        game: {
          published: true,
        },
      },
    });

    await createTrackTimestampComment({
      trackId: 4,
      content: " Great ",
      timestamp: 12,
      authorId: 9,
    });

    expect(dbMock.trackTimestampComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Great",
          timestamp: 12,
        }),
      }),
    );
  });

  it("errors for missing track timestamp targets", async () => {
    dbMock.gamePageTrack.findUnique.mockResolvedValue(null);
    await expect(
      createTrackTimestampComment({
        trackId: 99,
        content: "Great",
        timestamp: 12,
        authorId: 9,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

