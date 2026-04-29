import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageVersion } from "@prisma/client";

const { dbMock, moderationMock, recommendationMock } = vi.hoisted(() => ({
  dbMock: {
    jam: {
      findUnique: vi.fn(),
    },
    gamePageTrack: {
      findMany: vi.fn(),
    },
    trackRatingCategory: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
  moderationMock: {
    isPrivilegedViewer: vi.fn(),
    mapCommentsForViewer: vi.fn(),
  },
  recommendationMock: {
    applyRecommendationOverrides: vi.fn(),
    rankRecommendationCandidates: vi.fn(),
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../features/comments/thread.service.js", () => ({
  isPrivilegedViewer: moderationMock.isPrivilegedViewer,
  mapCommentsForViewer: moderationMock.mapCommentsForViewer,
}));

vi.mock("../features/users/recommendations.core.js", () => ({
  applyRecommendationOverrides: recommendationMock.applyRecommendationOverrides,
  rankRecommendationCandidates: recommendationMock.rankRecommendationCandidates,
}));

vi.mock("../features/tracks/page.js", () => ({
  materializeTrackPage: vi.fn((track) => ({
    ...track,
    pageVersion: track.gamePage?.version ?? PageVersion.JAM,
    gameId: track.gamePage?.gameId ?? track.gamePage?.game?.id ?? null,
    game: track.gamePage?.game ?? null,
  })),
  parseTrackPageVersion: vi.fn((value) =>
    value === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM,
  ),
}));

import { NotFoundError } from "../lib/errors.js";
import {
  getTrackBySlug,
  listTracks,
} from "../features/tracks/index.js";

describe("tracks read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moderationMock.isPrivilegedViewer.mockReturnValue(false);
    moderationMock.mapCommentsForViewer.mockImplementation((comments) => comments ?? []);
    recommendationMock.rankRecommendationCandidates.mockReturnValue({
      eligible: false,
      candidateIds: [],
    });
    recommendationMock.applyRecommendationOverrides.mockImplementation((candidateIds) =>
      candidateIds,
    );
  });

  it("lists tracks for a specific jam with a jam-scoped message", async () => {
    dbMock.jam.findUnique.mockResolvedValueOnce({ id: 12, slug: "third-edition" });
    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([
      {
        id: 11,
        sourceTrackId: null,
        slug: "theme-song",
        name: "Theme Song",
        ratings: [],
        comments: [],
        gamePage: {
          version: PageVersion.JAM,
          gameId: 4,
          name: "Theme Game",
          description: "",
          short: "",
          thumbnail: null,
          banner: null,
          screenshots: [],
          trailerUrl: null,
          itchEmbedUrl: null,
          itchEmbedAspectRatio: null,
          game: {
            id: 4,
            jamId: 12,
            category: "REGULAR",
            published: true,
            team: {
              users: [],
            },
            pages: [],
          },
        },
      },
    ]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([]);

    const result = await listTracks({
      jamSlug: "third-edition",
      sort: "newest",
      pageVersion: undefined,
    });

    expect(dbMock.gamePageTrack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          gamePage: expect.objectContaining({
            game: expect.objectContaining({ jamId: 12, published: true }),
          }),
        }),
      }),
    );
    expect(result.message).toBe("Fetched tracks for jam third-edition");
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        slug: "theme-song",
        pageVersion: PageVersion.JAM,
        game: expect.objectContaining({
          id: 4,
          jamId: 12,
        }),
      }),
    );
  });

  it("prefers the post-jam track when listing all versions of the same song", async () => {
    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([
      {
        id: 11,
        slug: "theme-song",
        name: "Theme Song",
        ratings: [],
        comments: [],
        gamePage: {
          version: PageVersion.JAM,
          gameId: 4,
          game: {
            id: 4,
            jamId: 12,
            category: "REGULAR",
            published: true,
            team: { users: [] },
            pages: [],
          },
        },
      },
      {
        id: 12,
        slug: "theme-song",
        name: "Theme Song Remastered",
        ratings: [],
        comments: [],
        gamePage: {
          version: PageVersion.POST_JAM,
          gameId: 4,
          game: {
            id: 4,
            jamId: 12,
            category: "REGULAR",
            published: true,
            team: { users: [] },
            pages: [],
          },
        },
      },
    ]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([]);

    const result = await listTracks({
      sort: "newest",
      pageVersion: "ALL",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 12,
        pageVersion: PageVersion.POST_JAM,
      }),
    );
  });

  it("loads a track detail view and prefers the post-jam page by default", async () => {
    dbMock.gamePageTrack.findMany
      .mockResolvedValueOnce([
        {
          id: 21,
          slug: "theme-song",
          userId: 7,
          gamePage: {
            version: PageVersion.JAM,
            game: {
              id: 4,
              jamId: 12,
              published: true,
              category: "REGULAR",
              team: {
                users: [],
              },
              pages: [
                {
                  version: PageVersion.JAM,
                  tracks: [{ slug: "theme-song" }],
                },
                {
                  version: PageVersion.POST_JAM,
                  tracks: [{ slug: "theme-song" }],
                },
              ],
            },
          },
          ratings: [],
          comments: [{ id: 1 }],
          timestampComments: [],
        },
        {
          id: 22,
          slug: "theme-song",
          userId: 7,
          gamePage: {
            version: PageVersion.POST_JAM,
            game: {
              id: 4,
              jamId: 12,
              published: true,
              category: "REGULAR",
              team: {
                users: [],
              },
              pages: [
                {
                  version: PageVersion.JAM,
                  tracks: [{ slug: "theme-song" }],
                },
                {
                  version: PageVersion.POST_JAM,
                  tracks: [{ slug: "theme-song" }],
                },
              ],
            },
          },
          ratings: [{ userId: 9 }],
          comments: [{ id: 2 }],
          timestampComments: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 22,
          gamePage: {
            game: {
              category: "REGULAR",
              team: { users: [] },
            },
          },
          ratings: [],
        },
      ]);
    dbMock.trackRatingCategory.findMany.mockResolvedValueOnce([]);

    const result = await getTrackBySlug({
      trackSlug: "theme-song",
      pageVersionInput: undefined,
      viewer: { id: 9, admin: false, mod: false },
    });

    expect(result.pageVersion).toBe(PageVersion.POST_JAM);
    expect(result.availablePageVersions).toEqual([
      PageVersion.JAM,
      PageVersion.POST_JAM,
    ]);
    expect(result.viewerRating).toEqual({ userId: 9 });
    expect(moderationMock.mapCommentsForViewer).toHaveBeenCalledWith(
      [{ id: 2 }],
      9,
      false,
    );
  });

  it("throws when the requested track does not exist", async () => {
    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([]);

    await expect(
      getTrackBySlug({
        trackSlug: "missing-track",
        pageVersionInput: undefined,
        viewer: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

