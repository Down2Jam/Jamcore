import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    themeSuggestion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(async () => ({ id: 1 })),
      delete: vi.fn(async () => ({})),
    },
    themeVote: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      groupBy: vi.fn(),
    },
    themeVote2: {
      findFirst: vi.fn(),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../features/jams/index.js", () => ({
  getCurrentActiveJam: vi.fn(),
}));

import { ForbiddenError } from "../lib/errors.js";
import { JAM_PHASES } from "../domain/jamTimeline.js";
import { getCurrentActiveJam } from "../features/jams/index.js";
import {
  assertSuggestionPhase,
  assertVotingStillOpen,
  createCurrentJamThemeSuggestion,
  createThemeSuggestion,
  deleteThemeSuggestionForUser,
  getTopThemeForJam,
  listCurrentJamThemeSuggestions,
  listThemesForJam,
  listUserThemeSuggestions,
  saveSlaughterVote,
  saveVotingRoundVote,
} from "../features/themes";

describe("themes service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentActiveJam).mockReset();
  });

  it("creates suggestions within the per-user limit", async () => {
    dbMock.themeSuggestion.count.mockResolvedValue(1);

    await createThemeSuggestion({
      suggestionText: "Space train",
      description: "fast",
      userId: 2,
      jamId: 3,
      themeLimit: 2,
    });

    expect(dbMock.themeSuggestion.create).toHaveBeenCalledWith({
      data: {
        suggestion: "Space train",
        userId: 2,
        jamId: 3,
        description: "fast",
      },
    });
  });

  it("lists and creates suggestions for the current active jam", async () => {
    vi.mocked(getCurrentActiveJam).mockResolvedValue({
      jam: { id: 3 },
      nextJam: null,
      phase: JAM_PHASES.suggestion,
    } as any);
    dbMock.themeSuggestion.findMany.mockResolvedValueOnce([{ id: 1 }]);

    await expect(listCurrentJamThemeSuggestions()).resolves.toEqual([{ id: 1 }]);
    expect(dbMock.themeSuggestion.findMany).toHaveBeenCalledWith({
      where: { jamId: 3 },
    });

    await createCurrentJamThemeSuggestion({
      suggestionText: "Moon",
      description: "low gravity",
      userId: 2,
    });

    expect(dbMock.themeSuggestion.create).toHaveBeenCalledWith({
      data: {
        suggestion: "Moon",
        description: "low gravity",
        userId: 2,
        jamId: 3,
      },
    });
  });

  it("blocks suggestions over the user limit", async () => {
    dbMock.themeSuggestion.count.mockResolvedValue(2);

    await expect(
      createThemeSuggestion({
        suggestionText: "Space train",
        userId: 2,
        jamId: 3,
        themeLimit: 2,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deletes only the owner suggestion", async () => {
    dbMock.themeSuggestion.findUnique.mockResolvedValueOnce({ id: 1, userId: 2 });
    await deleteThemeSuggestionForUser({ suggestionId: 1, userId: 2 });
    expect(dbMock.themeSuggestion.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("lists a user's theme suggestions", async () => {
    dbMock.themeSuggestion.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const suggestions = await listUserThemeSuggestions({
      userId: 2,
      jamId: 3,
    });

    expect(dbMock.themeSuggestion.findMany).toHaveBeenCalledWith({
      where: {
        userId: 2,
        jamId: 3,
      },
    });
    expect(suggestions).toEqual([{ id: 1 }]);
  });

  it("creates or updates slaughter and voting votes", async () => {
    dbMock.themeVote.findFirst.mockResolvedValueOnce(null);
    const slaughterResult = await saveSlaughterVote({
      suggestionId: 1,
      voteType: 1,
      userId: 2,
      jamId: 3,
    });
    expect(slaughterResult.edited).toBe(false);
    expect(dbMock.themeVote.create).toHaveBeenCalled();

    dbMock.themeVote2.findFirst.mockResolvedValueOnce({ id: 9 });
    const votingResult = await saveVotingRoundVote({
      suggestionId: 1,
      voteType: 3,
      userId: 2,
      jamId: 3,
    });
    expect(votingResult.edited).toBe(true);
    expect(dbMock.themeVote2.update).toHaveBeenCalled();
  });

  it("lists themes for voting mode", async () => {
    dbMock.themeVote.groupBy.mockResolvedValue([
      { themeSuggestionId: 1, _sum: { slaughterScore: 5 } },
    ]);
    dbMock.themeSuggestion.findMany.mockResolvedValue([{ id: 1, suggestion: "Space" }]);

    const themes = await listThemesForJam({
      jamId: 3,
      userId: 2,
      isVoting: true,
    });

    expect(themes).toEqual([
      expect.objectContaining({
        id: 1,
        slaughterScoreSum: 5,
      }),
    ]);
  });

  it("returns the highest-ranked top theme", async () => {
    dbMock.themeSuggestion.findMany.mockResolvedValueOnce([
      {
        id: 1,
        suggestion: "Space",
        votes2: [{ voteScore: 3 }, { voteScore: 1 }],
      },
      {
        id: 2,
        suggestion: "Dungeon",
        votes2: [{ voteScore: 3 }],
      },
    ]);

    const theme = await getTopThemeForJam(3);

    expect(theme).toEqual(
      expect.objectContaining({
        id: 1,
        voteScore: 4,
      }),
    );
  });

  it("validates phase helpers", () => {
    expect(() => assertSuggestionPhase(JAM_PHASES.suggestion)).not.toThrow();
    expect(() => assertSuggestionPhase("voting")).toThrow(ForbiddenError);
    expect(() => assertVotingStillOpen(new Date(Date.now() + 48 * 60 * 60 * 1000)))
      .not.toThrow();
  });
});

