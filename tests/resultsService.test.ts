import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageVersion } from "@prisma/client";

const { dbMock, trackPageMock, gamePageMock } = vi.hoisted(() => ({
  dbMock: {
    gamePageTrack: {
      findMany: vi.fn(),
    },
    trackRatingCategory: {
      findMany: vi.fn(),
    },
    game: {
      findMany: vi.fn(),
    },
    ratingCategory: {
      findMany: vi.fn(),
    },
  },
  trackPageMock: {
    materializeTrackPage: vi.fn((track) => ({
      ...track,
      game: track.gamePage?.game ?? null,
      pageVersion: track.gamePage?.version ?? PageVersion.JAM,
    })),
  },
  gamePageMock: {
    materializeGamePage: vi.fn((game, version = PageVersion.JAM) => ({
      ...game,
      ...(game.pages?.find((page: any) => page.version === version) ??
        game.pages?.[0] ??
        {}),
    })),
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../features/tracks/page.js", () => ({
  materializeTrackPage: trackPageMock.materializeTrackPage,
}));

vi.mock("../features/games/page.helpers.js", () => ({
  materializeGamePage: gamePageMock.materializeGamePage,
}));

import { getResults } from "../features/results";

describe("results service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides results for the active jam before the rating period ends", async () => {
    const result = await getResults({
      input: {
        category: "REGULAR",
        contentType: "GAME",
        sort: "OVERALL",
        jam: "5",
        preview: undefined,
        recap: undefined,
      },
      jam: {
        id: 5,
        startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        jammingHours: 24,
        submissionHours: 24,
        ratingHours: 24,
      },
      viewer: { admin: false },
    });

    expect(result).toEqual({ data: [] });
    expect(dbMock.game.findMany).not.toHaveBeenCalled();
  });

  it("returns music results for a jam", async () => {
    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([
      {
        id: 4,
        ratings: [
          {
            value: 8,
            categoryId: 1,
            user: {
              teams: [
                {
                  game: {
                    jamId: 7,
                    category: "REGULAR",
                    published: true,
                  },
                },
              ],
            },
          },
          {
            value: 9,
            categoryId: 1,
            user: {
              teams: [
                {
                  game: {
                    jamId: 7,
                    category: "REGULAR",
                    published: true,
                  },
                },
              ],
            },
          },
          {
            value: 10,
            categoryId: 1,
            user: {
              teams: [
                {
                  game: {
                    jamId: 7,
                    category: "REGULAR",
                    published: true,
                  },
                },
              ],
            },
          },
          {
            value: 9,
            categoryId: 1,
            user: {
              teams: [
                {
                  game: {
                    jamId: 7,
                    category: "REGULAR",
                    published: true,
                  },
                },
              ],
            },
          },
          {
            value: 8,
            categoryId: 1,
            user: {
              teams: [
                {
                  game: {
                    jamId: 7,
                    category: "REGULAR",
                    published: true,
                  },
                },
              ],
            },
          },
        ],
        gamePage: {
          version: PageVersion.JAM,
          game: {
            id: 12,
            jamId: 7,
            category: "REGULAR",
            team: {
              users: [
                {
                  trackRatings: Array.from({ length: 5 }, () => ({
                    track: {
                      gamePage: {
                        game: {
                          jamId: 7,
                        },
                      },
                    },
                  })),
                },
              ],
            },
          },
        },
      },
    ]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([
      { id: 1, name: "Overall" },
    ]);

    const result = await getResults({
      input: {
        category: "REGULAR",
        contentType: "MUSIC",
        sort: "OVERALL",
        jam: "7",
        preview: undefined,
        recap: undefined,
      },
      jam: null,
      viewer: null,
    });

    expect(dbMock.gamePageTrack.findMany).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 4,
        pageVersion: PageVersion.JAM,
      }),
    );
  });

  it("uses parent game audio score to weight under-rated music results", async () => {
    const eligibleRater = {
      user: {
        teams: [
          {
            game: {
              jamId: 7,
              category: "REGULAR",
              published: true,
            },
          },
        ],
      },
    };

    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([
      {
        id: 8,
        ratings: [8, 8, 8].map((value) => ({
          value,
          categoryId: 1,
          ...eligibleRater,
        })),
        gamePage: {
          version: PageVersion.JAM,
          game: {
            id: 12,
            jamId: 7,
            category: "REGULAR",
            ratings: Array.from({ length: 5 }, () => ({
              value: 9,
              category: { name: "RatingCategory.Audio.Title" },
              gamePage: { version: PageVersion.JAM },
              ...eligibleRater,
            })),
            team: {
              users: [
                {
                  trackRatings: Array.from({ length: 5 }, () => ({
                    track: {
                      gamePage: {
                        game: {
                          jamId: 7,
                        },
                      },
                    },
                  })),
                },
              ],
            },
          },
        },
      },
    ]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([
      { id: 1, name: "Overall" },
    ]);

    const result = await getResults({
      input: {
        category: "REGULAR",
        contentType: "MUSIC",
        sort: "OVERALL",
        jam: "7",
        preview: undefined,
        recap: undefined,
      },
      jam: null,
      viewer: null,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].categoryAverages[0]).toEqual(
      expect.objectContaining({
        averageScore: 8.4,
        rankedRatingCount: 5,
        actualRankedRatingCount: 3,
      }),
    );
  });

  it("combines jam and post-jam ratings for post-jam music results", async () => {
    const eligibleRater = {
      user: {
        teams: [
          {
            game: {
              jamId: 7,
              category: "REGULAR",
              published: true,
            },
          },
        ],
      },
    };
    const game = {
      id: 12,
      jamId: 7,
      category: "REGULAR",
      ratings: [],
      team: {
        users: [
          {
            trackRatings: [
              ...Array.from({ length: 2 }, () => ({
                track: {
                  gamePage: {
                    version: PageVersion.JAM,
                    game: { jamId: 7 },
                  },
                },
              })),
              ...Array.from({ length: 3 }, () => ({
                track: {
                  gamePage: {
                    version: PageVersion.POST_JAM,
                    game: { jamId: 7 },
                  },
                },
              })),
            ],
          },
        ],
      },
    };

    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([
      {
        id: 8,
        slug: "theme",
        ratings: [10, 10].map((value) => ({
          value,
          categoryId: 1,
          ...eligibleRater,
        })),
        gamePage: {
          version: PageVersion.JAM,
          game,
        },
      },
      {
        id: 9,
        slug: "theme",
        ratings: [8, 8, 8].map((value) => ({
          value,
          categoryId: 1,
          ...eligibleRater,
        })),
        gamePage: {
          version: PageVersion.POST_JAM,
          game,
        },
      },
    ]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([
      { id: 1, name: "Overall" },
    ]);

    const result = await getResults({
      input: {
        category: "REGULAR",
        contentType: "MUSIC",
        sort: "OVERALL",
        jam: "7",
        preview: undefined,
        recap: undefined,
      },
      jam: null,
      viewer: null,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 9,
        pageVersion: PageVersion.POST_JAM,
      }),
    );
    expect(result.data[0].categoryAverages[0]).toEqual(
      expect.objectContaining({
        averageScore: 8.8,
        ratingCount: 5,
        rankedRatingCount: 5,
      }),
    );
  });

  it("returns game results sorted by the requested category", async () => {
    dbMock.game.findMany.mockResolvedValueOnce([
      {
        id: 3,
        category: "REGULAR",
        pages: [
          {
            version: PageVersion.JAM,
            name: "Alpha",
            ratingCategories: [],
            majRatingCategories: [],
            tags: [],
            flags: [],
            downloadLinks: [],
            achievements: [],
            leaderboards: [],
            comments: [],
          },
        ],
        team: {
          users: [
            {
              ratings: Array.from({ length: 10 }, () => ({
                gamePage: {
                  version: PageVersion.JAM,
                  ratingCategories: [{ id: 1 }],
                },
                game: {
                  ratingCategories: [],
                },
              })),
            },
          ],
        },
        ratings: Array.from({ length: 5 }, (_, index) => ({
          value: 10 - index,
          categoryId: 1,
          gamePage: {
            version: PageVersion.JAM,
          },
          user: {
            teams: [{ game: { published: true } }],
          },
        })),
      },
    ]);
    dbMock.ratingCategory.findMany.mockResolvedValueOnce([
      {
        id: 1,
        name: "RatingCategory.Overall.Title",
        askMajorityContent: false,
      },
    ]);

    const result = await getResults({
      input: {
        category: "REGULAR",
        contentType: "GAME",
        sort: "OVERALL",
        jam: "8",
        preview: "1",
        recap: undefined,
      },
      jam: {
        id: 8,
        startTime: new Date().toISOString(),
        jammingHours: 0,
        submissionHours: 0,
        ratingHours: 0,
      },
      viewer: { admin: true },
    });

    expect(dbMock.game.findMany).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 3,
        pageVersion: PageVersion.JAM,
      }),
    );
  });

  it("combines jam and post-jam ratings for post-jam game results", async () => {
    dbMock.game.findMany.mockResolvedValueOnce([
      {
        id: 3,
        category: "REGULAR",
        pages: [
          {
            version: PageVersion.JAM,
            name: "Alpha",
            ratingCategories: [{ id: 1, name: "RatingCategory.Overall.Title" }],
            majRatingCategories: [],
            tags: [],
            flags: [],
            downloadLinks: [],
            achievements: [],
            leaderboards: [],
            comments: [],
          },
          {
            version: PageVersion.POST_JAM,
            name: "Alpha Post",
            ratingCategories: [{ id: 1, name: "RatingCategory.Overall.Title" }],
            majRatingCategories: [],
            tags: [],
            flags: [],
            downloadLinks: [],
            achievements: [],
            leaderboards: [],
            comments: [],
          },
        ],
        team: {
          users: [
            {
              ratings: [
                ...Array.from({ length: 2 }, () => ({
                  gamePage: {
                    version: PageVersion.JAM,
                    ratingCategories: [{ id: 1 }],
                  },
                  game: { ratingCategories: [] },
                })),
                ...Array.from({ length: 3 }, () => ({
                  gamePage: {
                    version: PageVersion.POST_JAM,
                    ratingCategories: [{ id: 1 }],
                  },
                  game: { ratingCategories: [] },
                })),
              ],
            },
          ],
        },
        ratings: [
          ...[10, 10].map((value) => ({
            value,
            categoryId: 1,
            gamePage: { version: PageVersion.JAM },
            user: { teams: [{ game: { published: true } }] },
          })),
          ...[8, 8, 8].map((value) => ({
            value,
            categoryId: 1,
            gamePage: { version: PageVersion.POST_JAM },
            user: { teams: [{ game: { published: true } }] },
          })),
        ],
      },
    ]);
    dbMock.ratingCategory.findMany.mockResolvedValueOnce([]);

    const result = await getResults({
      input: {
        category: "REGULAR",
        contentType: "GAME",
        sort: "OVERALL",
        jam: "8",
        preview: "1",
        recap: undefined,
      },
      jam: {
        id: 8,
        startTime: new Date().toISOString(),
        jammingHours: 0,
        submissionHours: 0,
        ratingHours: 0,
      },
      viewer: { admin: true },
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 3,
        name: "Alpha Post",
        pageVersion: PageVersion.POST_JAM,
      }),
    );
    expect(result.data[0].categoryAverages[0]).toEqual(
      expect.objectContaining({
        averageScore: 8.8,
        ratingCount: 5,
      }),
    );
  });
});

