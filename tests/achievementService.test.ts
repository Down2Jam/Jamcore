import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    gamePageAchievement: {
      findFirst: vi.fn(),
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../lib/contentTenant.js", () => ({
  assertGameBelongsToTenant: vi.fn(async () => undefined),
}));

import { NotFoundError } from "../lib/errors.js";
import {
  connectAchievementToUser,
  disconnectAchievementFromUser,
} from "../features/achievements/index.js";

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

    await disconnectAchievementFromUser({ achievementId: 7, userId: 2 });
    expect(dbMock.gamePageAchievement.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { users: { disconnect: { id: 2 } } },
    });
  });

  it("throws when the achievement does not exist", async () => {
    dbMock.gamePageAchievement.findFirst.mockResolvedValueOnce(null);
    await expect(
      connectAchievementToUser({ achievementId: 99, userId: 2 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

