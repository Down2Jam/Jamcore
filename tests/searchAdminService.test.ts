import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  platformStoreMock,
  searchStoreMock,
  indexingServiceMock,
  jobQueueMock,
} = vi.hoisted(() => ({
  platformStoreMock: {
    listSearchSynonymsFromDb: vi.fn(),
    getSearchSettingsFromDb: vi.fn(),
    listJobsFromDb: vi.fn(),
    createSearchSynonymInDb: vi.fn(),
    deleteSearchSynonymInDb: vi.fn(),
    upsertSearchSettingsInDb: vi.fn(),
    updateSearchSynonymGroupInDb: vi.fn(),
  },
  searchStoreMock: {
    getSearchIndexStats: vi.fn(),
    listSearchReindexRuns: vi.fn(),
    getSearchReindexRunById: vi.fn(),
  },
  indexingServiceMock: {
    startSearchReindexRun: vi.fn(),
  },
  jobQueueMock: {
    enqueueJob: vi.fn(),
  },
}));

vi.mock("../infra/platformStore.js", () => platformStoreMock);
vi.mock("../infra/searchStore.js", () => searchStoreMock);
vi.mock("../features/search/indexing.service.js", () => indexingServiceMock);
vi.mock("../infra/jobQueue.js", () => jobQueueMock);

import {
  expandSearchTerms,
  enqueueSearchReindex,
  listSearchAdminState,
} from "../features/search/admin.service.js";

describe("search admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformStoreMock.getSearchSettingsFromDb.mockResolvedValue(null);
    platformStoreMock.listJobsFromDb.mockResolvedValue([]);
    searchStoreMock.getSearchIndexStats.mockResolvedValue({
      documentCount: 0,
      staleCount: 0,
      byType: {},
      lastIndexedAt: null,
    });
    searchStoreMock.listSearchReindexRuns.mockResolvedValue([]);
  });

  it("expands grouped enabled synonyms", async () => {
    platformStoreMock.listSearchSynonymsFromDb.mockResolvedValue([
      {
        id: "1",
        term: "jam",
        synonym: "game jam",
        groupKey: "group-a",
        enabled: true,
      },
      {
        id: "2",
        term: "ludum dare",
        synonym: "ld",
        groupKey: "group-a",
        enabled: true,
      },
      {
        id: "3",
        term: "hidden",
        synonym: "secret",
        groupKey: "group-b",
        enabled: false,
      },
    ]);

    const expanded = await expandSearchTerms("jam", "default");

    expect(expanded).toEqual(
      expect.arrayContaining(["jam", "game jam", "ludum dare", "ld"]),
    );
    expect(expanded).not.toContain("secret");
  });

  it("returns grouped synonym state and reindex runs", async () => {
    platformStoreMock.listSearchSynonymsFromDb.mockResolvedValue([
      {
        id: "1",
        term: "jam",
        synonym: "game jam",
        groupKey: "group-a",
        notes: "common aliases",
        enabled: true,
      },
    ]);
    searchStoreMock.listSearchReindexRuns.mockResolvedValue([
      {
        id: "run-1",
        status: "running",
      },
    ]);

    const state = await listSearchAdminState("default");

    expect(state.synonymGroups).toEqual([
      expect.objectContaining({
        groupKey: "group-a",
        terms: ["jam", "game jam"],
      }),
    ]);
    expect(state.reindexRuns).toEqual([{ id: "run-1", status: "running" }]);
  });

  it("resumes an existing search reindex run", async () => {
    searchStoreMock.getSearchReindexRunById.mockResolvedValue({
      id: "run-1",
    });

    const runId = await enqueueSearchReindex({ runId: "run-1" });

    expect(runId).toBe("run-1");
  });
});
