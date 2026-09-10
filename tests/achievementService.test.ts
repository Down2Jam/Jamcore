import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
    achievementUnlock: {
      deleteMany: vi.fn(async () => ({})),
      findMany: vi.fn(),
      upsert: vi.fn(async () => ({})),
    },
    gamePageAchievement: {
      findFirst: vi.fn(),
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/lib/contentTenant.js", () => ({
  assertGameBelongsToTenant: vi.fn(async () => undefined),
}));

import { NotFoundError } from "../src/lib/errors.js";
import {
  connectAchievementToUser,
  disconnectAchievementFromUser,
  listRecentAchievementUnlocks,
} from "../src/features/achievements/index.js";

describe("achievement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.gamePageAchievement.findFirst.mockReset();
    dbMock.gamePageAchievement.findFirst.mockResolvedValue({
      id: 7,
      gamePage: {
        game: {
          id: 3,
        },
      },
    });
  });

  it("connects and disconnects achievements for a user", async () => {
    await connectAchievementToUser({ achievementId: 7, userId: 2 });
    expect(dbMock.gamePageAchievement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { users: { connect: { id: 2 } } },
    });
    expect(dbMock.achievementUnlock.upsert).toHaveBeenCalledWith({
      where: { achievementId_userId: { achievementId: 7, userId: 2 } },
      create: { achievementId: 7, userId: 2 },
      update: {},
    });

    await disconnectAchievementFromUser({ achievementId: 7, userId: 2 });
    expect(dbMock.gamePageAchievement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { users: { disconnect: { id: 2 } } },
    });
    expect(dbMock.achievementUnlock.deleteMany).toHaveBeenCalledWith({
      where: { achievementId: 7, userId: 2 },
    });
  });

  it("throws when the achievement does not exist", async () => {
    dbMock.gamePageAchievement.findFirst.mockResolvedValueOnce(null);
    await expect(
      connectAchievementToUser({ achievementId: 99, userId: 2 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps each user's highest-ranked and rarest recent achievement", async () => {
    const user = {
      id: 2,
      slug: "player-two",
      name: "Player Two",
      profilePicture: null,
    };
    const makeUnlock = ({
      id,
      earnedAt,
      earnedCount,
      engagedCount,
      gameId = 3,
      user: unlockUser = user,
    }: {
      id: number;
      earnedAt: string;
      earnedCount: number;
      engagedCount: number;
      gameId?: number;
      user?: typeof user;
    }) => ({
      earnedAt: new Date(earnedAt),
      user: unlockUser,
      achievement: {
        id,
        name: `Achievement ${id}`,
        description: null,
        image: null,
        _count: { users: earnedCount },
        gamePage: {
          id: 10,
          version: "JAM",
          name: "Test Game",
          thumbnail: null,
          achievements: [
            {
              users: Array.from({ length: engagedCount }, (_, index) => ({
                id: index + 1,
              })),
            },
          ],
          leaderboards: [],
          ratings: [],
          game: { id: gameId, slug: `test-game-${gameId}` },
        },
      },
    });

    dbMock.achievementUnlock.findMany.mockResolvedValue([
      makeUnlock({
        id: 1,
        earnedAt: "2026-09-09T12:00:00Z",
        earnedCount: 6,
        engagedCount: 20,
      }),
      makeUnlock({
        id: 2,
        earnedAt: "2026-09-09T11:00:00Z",
        earnedCount: 2,
        engagedCount: 20,
      }),
      makeUnlock({
        id: 3,
        earnedAt: "2026-09-09T10:00:00Z",
        earnedCount: 1,
        engagedCount: 20,
      }),
    ]);

    const result = await listRecentAchievementUnlocks(null);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      achievement: { id: 3 },
      tier: "Diamond",
      earnedCount: 1,
      rank: 4,
    });
  });

  it("shows one achievement per user and game while falling back to a user's next game", async () => {
    const alice = {
      id: 2,
      slug: "alice",
      name: "Alice",
      profilePicture: null,
    };
    const bob = {
      id: 3,
      slug: "bob",
      name: "Bob",
      profilePicture: null,
    };
    const carol = {
      id: 4,
      slug: "carol",
      name: "Carol",
      profilePicture: null,
    };
    const dave = {
      id: 5,
      slug: "dave",
      name: "Dave",
      profilePicture: null,
    };
    const makeUnlock = ({
      id,
      user,
      gameId,
      earnedCount,
      engagedCount,
      earnedAt,
    }: {
      id: number;
      user: typeof alice;
      gameId: number;
      earnedCount: number;
      engagedCount: number;
      earnedAt: string;
    }) => ({
      earnedAt: new Date(earnedAt),
      user,
      achievement: {
        id,
        name: `Achievement ${id}`,
        description: null,
        image: null,
        _count: { users: earnedCount },
        gamePage: {
          id: gameId * 10,
          version: "JAM",
          name: `Game ${gameId}`,
          thumbnail: null,
          achievements: [
            {
              users: Array.from({ length: engagedCount }, (_, index) => ({
                id: index + 1,
              })),
            },
          ],
          leaderboards: [],
          ratings: [],
          game: { id: gameId, slug: `game-${gameId}` },
        },
      },
    });

    dbMock.achievementUnlock.findMany.mockResolvedValue([
      makeUnlock({
        id: 10,
        user: alice,
        gameId: 1,
        earnedCount: 3,
        engagedCount: 20,
        earnedAt: "2026-09-09T14:00:00Z",
      }),
      makeUnlock({
        id: 11,
        user: bob,
        gameId: 1,
        earnedCount: 2,
        engagedCount: 20,
        earnedAt: "2026-09-09T13:00:00Z",
      }),
      makeUnlock({
        id: 12,
        user: alice,
        gameId: 2,
        earnedCount: 2,
        engagedCount: 5,
        earnedAt: "2026-09-09T12:00:00Z",
      }),
      makeUnlock({
        id: 13,
        user: carol,
        gameId: 3,
        earnedCount: 2,
        engagedCount: 20,
        earnedAt: "2026-09-09T11:00:00Z",
      }),
      makeUnlock({
        id: 14,
        user: dave,
        gameId: 3,
        earnedCount: 1,
        engagedCount: 20,
        earnedAt: "2026-09-09T10:00:00Z",
      }),
    ]);

    const result = await listRecentAchievementUnlocks(null);

    expect(result.map((entry) => entry.achievement.id)).toEqual([11, 12, 14]);
    expect(new Set(result.map((entry) => entry.user.id)).size).toBe(result.length);
    expect(new Set(result.map((entry) => entry.game.id)).size).toBe(result.length);
  });
});

