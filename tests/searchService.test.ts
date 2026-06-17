import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageVersion } from "@prisma/client";

const {
  dbMock,
  searchStoreMock,
  adminServiceMock,
  gamePageMock,
  trackPageMock,
  searchReadinessMock,
} = vi.hoisted(() => ({
  dbMock: {
    game: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
    gamePageTrack: {
      findMany: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
    },
  },
  searchStoreMock: {
    querySearchDocuments: vi.fn(),
    getSearchIndexStats: vi.fn(),
  },
  adminServiceMock: {
    expandSearchTerms: vi.fn(),
    getSearchTuning: vi.fn(),
  },
  searchReadinessMock: {
    ensureSearchBootstrap: vi.fn(),
  },
  gamePageMock: {
    materializeGamePage: vi.fn((game, version) => ({
      ...game,
      ...(game.pages?.find((page: any) => page.version === version) ??
        game.pages?.[0] ??
        {}),
      pageVersion: version,
    })),
  },
  trackPageMock: {
    materializeTrackPage: vi.fn((track) => ({
      ...track,
      game: track.gamePage?.game ?? null,
      pageVersion: track.gamePage?.version ?? PageVersion.JAM,
    })),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/infra/searchStore.js", () => ({
  querySearchDocuments: searchStoreMock.querySearchDocuments,
  getSearchIndexStats: searchStoreMock.getSearchIndexStats,
}));

vi.mock("../src/features/search/admin.service.js", () => ({
  expandSearchTerms: adminServiceMock.expandSearchTerms,
  getSearchTuning: adminServiceMock.getSearchTuning,
}));

vi.mock("../src/features/search/readiness.js", () => ({
  ensureSearchBootstrap: searchReadinessMock.ensureSearchBootstrap,
}));

vi.mock("../src/features/games/page.helpers.js", () => ({
  materializeGamePage: gamePageMock.materializeGamePage,
}));

vi.mock("../src/features/tracks/page.js", () => ({
  materializeTrackPage: trackPageMock.materializeTrackPage,
}));

import { searchContent } from "../src/features/search";

describe("search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStoreMock.getSearchIndexStats.mockResolvedValue({
      documentCount: 5,
      staleCount: 0,
      byType: {},
      lastIndexedAt: new Date().toISOString(),
    });
    adminServiceMock.expandSearchTerms.mockResolvedValue(["alpha"]);
    adminServiceMock.getSearchTuning.mockResolvedValue({
      exactMatchBoost: 3,
      prefixMatchBoost: 2,
      substringMatchBoost: 1,
      fuzzyThreshold: 0.1,
      gameWeight: 1.2,
      trackWeight: 1,
      postWeight: 1,
      userWeight: 1,
      teamWeight: 0.9,
      freshnessHalfLifeHours: 168,
    });
    searchReadinessMock.ensureSearchBootstrap.mockResolvedValue(undefined);
  });

  it("hydrates grouped search results from indexed documents", async () => {
    searchStoreMock.querySearchDocuments.mockResolvedValueOnce([
      {
        documentId: "game:2:JAM",
        tenantId: "default",
        entityType: "game",
        entityId: 2,
        variant: "JAM",
        title: "Alpha",
        subtitle: null,
        body: null,
        slug: "alpha",
        tags: [],
        visibility: "public",
        metadata: { pageVersion: PageVersion.POST_JAM },
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 10,
      },
      {
        documentId: "user:1",
        tenantId: "default",
        entityType: "user",
        entityId: 1,
        variant: null,
        title: "Ben",
        subtitle: null,
        body: null,
        slug: "ben",
        tags: [],
        visibility: "public",
        metadata: {},
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 9,
      },
      {
        documentId: "post:3",
        tenantId: "default",
        entityType: "post",
        entityId: 3,
        variant: null,
        title: "Alpha update",
        subtitle: null,
        body: null,
        slug: "alpha-update",
        tags: [],
        visibility: "public",
        metadata: {},
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 8,
      },
      {
        documentId: "track:5:POST_JAM",
        tenantId: "default",
        entityType: "track",
        entityId: 5,
        variant: "POST_JAM",
        title: "Theme Song Post",
        subtitle: null,
        body: null,
        slug: "theme-song",
        tags: [],
        visibility: "public",
        metadata: { pageVersion: PageVersion.POST_JAM },
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 7,
      },
      {
        documentId: "team:6",
        tenantId: "default",
        entityType: "team",
        entityId: 6,
        variant: null,
        title: "Team Alpha",
        subtitle: null,
        body: null,
        slug: null,
        tags: [],
        visibility: "public",
        metadata: {},
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 6,
      },
    ]);
    dbMock.game.findMany.mockResolvedValueOnce([
      {
        id: 2,
        pages: [
          { version: PageVersion.JAM, name: "Alpha" },
          { version: PageVersion.POST_JAM, name: "Alpha Post" },
        ],
      },
    ]);
    dbMock.user.findMany.mockResolvedValueOnce([
      { id: 1, name: "Ben", slug: "ben", bannerPicture: null, profilePicture: null, short: null },
    ]);
    dbMock.post.findMany.mockResolvedValueOnce([
      { id: 3, title: "Alpha update", slug: "alpha-update", updatedAt: new Date() },
    ]);
    dbMock.gamePageTrack.findMany.mockResolvedValueOnce([
      {
        id: 5,
        slug: "theme-song",
        name: "Theme Song Post",
        updatedAt: new Date(),
        gamePage: {
          version: PageVersion.POST_JAM,
          game: { id: 2 },
        },
      },
    ]);
    dbMock.team.findMany.mockResolvedValueOnce([{ id: 6, name: "Team Alpha" }]);

    const result = await searchContent({
      query: "alpha",
      type: undefined,
      includeFacets: "true",
    });

    expect(result.message).toBe("Data searched");
    expect(result.meta.totalMatches).toBe(5);
    expect(result.meta.facets).toEqual({
      games: 1,
      users: 1,
      posts: 1,
      tracks: 1,
      teams: 1,
    });
    expect(result.data.games).toHaveLength(1);
    expect(result.data.users).toHaveLength(1);
    expect(result.data.posts).toHaveLength(1);
    expect(result.data.tracks).toHaveLength(1);
    expect(result.data.teams).toHaveLength(1);
    expect(result.data.games[0]).toEqual(
      expect.objectContaining({
        searchSnippet: expect.any(String),
        searchHighlights: expect.any(Object),
      }),
    );
    expect(result.data.tracks[0]).toEqual(
      expect.objectContaining({
        id: 5,
        pageVersion: PageVersion.POST_JAM,
        searchSnippet: expect.any(String),
      }),
    );
  });

  it("limits search to the requested type", async () => {
    searchStoreMock.querySearchDocuments.mockResolvedValueOnce([
      {
        documentId: "user:1",
        tenantId: "default",
        entityType: "user",
        entityId: 1,
        variant: null,
        title: "Ben",
        subtitle: null,
        body: null,
        slug: "ben",
        tags: [],
        visibility: "public",
        metadata: {},
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 9,
      },
    ]);
    dbMock.user.findMany.mockResolvedValueOnce([
      { id: 1, name: "Ben", slug: "ben", bannerPicture: null, profilePicture: null, short: null },
    ]);

    const result = await searchContent({
      query: "ben",
      type: "users",
      debug: "true",
    });

    expect(searchStoreMock.querySearchDocuments).toHaveBeenCalledTimes(1);
    expect(dbMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(dbMock.game.findMany).not.toHaveBeenCalled();
    expect(result.meta.debug).toEqual(
      expect.objectContaining({
        expandedTerms: ["alpha"],
        matches: [
          expect.objectContaining({
            documentId: "user:1",
            entityType: "user",
          }),
        ],
      }),
    );
    expect(result.data).toEqual({
      users: [
        expect.objectContaining({
          id: 1,
          name: "Ben",
          slug: "ben",
          searchSnippet: expect.any(String),
          searchDebug: expect.any(Object),
        }),
      ],
    });
  });

  it("reuses cached results for the same indexed query", async () => {
    searchStoreMock.querySearchDocuments.mockResolvedValueOnce([
      {
        documentId: "user:1",
        tenantId: "default",
        entityType: "user",
        entityId: 1,
        variant: null,
        title: "Ben",
        subtitle: null,
        body: null,
        slug: "ben",
        tags: [],
        visibility: "public",
        metadata: {},
        sourceUpdatedAt: new Date().toISOString(),
        indexedAt: new Date().toISOString(),
        score: 9,
      },
    ]);
    dbMock.user.findMany.mockResolvedValueOnce([
      { id: 1, name: "Ben", slug: "ben", bannerPicture: null, profilePicture: null, short: null },
    ]);

    const first = await searchContent({
      query: "ben",
      type: "users",
      limit: 1,
    });
    const second = await searchContent({
      query: "ben",
      type: "users",
      limit: 1,
    });

    expect(first.data.users).toHaveLength(1);
    expect(second.data.users).toHaveLength(1);
    expect(searchStoreMock.querySearchDocuments).toHaveBeenCalledTimes(1);
  });

  it("fails with a not-ready error when the search index is empty", async () => {
    searchStoreMock.getSearchIndexStats.mockResolvedValueOnce({
      documentCount: 0,
      staleCount: 0,
      byType: {},
      lastIndexedAt: null,
    });
    await expect(
      searchContent({
        query: "pomo",
        type: "games",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "ERR_SEARCH_INDEX_NOT_READY",
    });
    expect(searchStoreMock.querySearchDocuments).not.toHaveBeenCalled();
    expect(searchReadinessMock.ensureSearchBootstrap).toHaveBeenCalledTimes(1);
  });
});
