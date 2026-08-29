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

  it("can exclude external games from random selection", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([]);

    await expect(getRandomPublishedGame(undefined, false)).resolves.toBeNull();

    const query = dbMock.$queryRaw.mock.calls[0];
    expect(query[0].join(" ")).toContain('g."category"::text <>');
    expect(query).toContain(false);
    expect(query).toContain("EXTERNAL");
  });

  it("never treats imported jams as active", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([]);

    await getRandomPublishedGame();

    expect(dbMock.$queryRaw.mock.calls[0][0].join(" ")).toContain(
      'j."source_platform" IS NULL',
    );
  });

  it("only prefers active jams that have an eligible published game", async () => {
    dbMock.$queryRaw.mockResolvedValueOnce([]);

    await getRandomPublishedGame(undefined, false);

    const sql = dbMock.$queryRaw.mock.calls[0][0].join(" ");
    expect(sql).toContain("AND EXISTS");
    expect(sql).toContain('active_game."published" = TRUE');
    expect(sql).toContain('active_game."category"::text <>');
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

