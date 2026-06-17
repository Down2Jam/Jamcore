import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, gamePagesMock } = vi.hoisted(() => ({
  dbMock: {
    team: {
      findMany: vi.fn(),
    },
  },
  gamePagesMock: {
    materializeGamePage: vi.fn((game) => game),
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

import { listTeams } from "../src/features/teams/listing.service.js";

describe("team listing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all teams when no target user is provided", async () => {
    dbMock.team.findMany.mockResolvedValueOnce([]);

    await listTeams({});

    expect(dbMock.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          users: true,
          owner: true,
        }),
      }),
    );
  });

  it("filters teams by target user when one is provided", async () => {
    dbMock.team.findMany.mockResolvedValueOnce([]);

    await listTeams({ targetUserId: 7 });

    expect(dbMock.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          users: {
            some: {
              id: 7,
            },
          },
        },
      }),
    );
  });
});

