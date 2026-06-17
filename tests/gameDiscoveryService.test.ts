import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, gamePagesMock } = vi.hoisted(() => ({
  dbMock: {
    $queryRaw: vi.fn(),
    game: {
      findMany: vi.fn(),
    },
  },
  gamePagesMock: {
    materializeGamePage: vi.fn((game) => ({
      ...game,
      name: game.pages?.[0]?.name ?? null,
    })),
    gamePageInclude: {},
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/features/games/page.helpers.js", () => ({
  materializeGamePage: gamePagesMock.materializeGamePage,
  gamePageInclude: gamePagesMock.gamePageInclude,
}));

import {
  getRandomPublishedGame,
  listCurrentUserGames,
} from "../src/features/games/discovery.service.js";

describe("game discovery service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the first random published game or null", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([{ id: 2, name: "Alpha" }]);

    await expect(getRandomPublishedGame()).resolves.toEqual({
      id: 2,
      name: "Alpha",
    });
  });

  it("returns the current user's games with jam and post-jam pages split out", async () => {
    dbMock.game.findMany.mockResolvedValueOnce([
      {
        id: 7,
        pages: [
          { version: "JAM", name: "Jam Name" },
          { version: "POST_JAM", name: "Post Name" },
        ],
      },
    ]);

    const result = await listCurrentUserGames({
      userId: 3,
      jamId: 4,
    });

    expect(dbMock.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jamId: 4,
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 7,
        jamPage: expect.objectContaining({ version: "JAM" }),
        postJamPage: expect.objectContaining({ version: "POST_JAM" }),
      }),
    ]);
  });
});

