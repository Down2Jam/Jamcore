import { randomUUID } from "node:crypto";

import { appConfig } from "../../config/app.js";
import {
  countCoreEntitiesByTenant,
  listCoreEntitiesByTenantPage,
} from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { recordSearchIndexing } from "../../infra/metrics.js";
import {
  createSearchReindexRun,
  deleteSearchDocumentsForEntity,
  getSearchReindexRunById,
  listSearchReindexRuns,
  type SearchDocumentRecord,
  updateSearchReindexRun,
  upsertSearchDocuments,
} from "../../infra/searchStore.js";
import {
  buildGameSearchDocuments,
  buildPostSearchDocuments,
  buildTeamSearchDocuments,
  buildTrackSearchDocuments,
  buildUserSearchDocuments,
} from "./documents/index.js";
import { clearSearchCache } from "./service.js";
import { enqueueJob } from "../../infra/jobQueue.js";

export type SearchIndexEntityType = "game" | "user" | "post" | "track" | "team";
const REINDEX_ENTITY_TYPES = ["user", "post", "team", "game"] as const;
type ReindexEntityType = (typeof REINDEX_ENTITY_TYPES)[number];

async function buildDocumentsForEntity(input: {
  entityType: SearchIndexEntityType;
  entityId: number;
  tenantId?: string | null;
}) {
  switch (input.entityType) {
    case "game": {
      const gameDocuments = await buildGameSearchDocuments({
        gameId: input.entityId,
        tenantId: input.tenantId,
      });
      const trackIds = await db.gamePageTrack.findMany({
        where: {
          gamePage: {
            gameId: input.entityId,
          },
        },
        select: {
          id: true,
        },
      });
      const trackDocuments = (
        await Promise.all(
          trackIds.map((track) =>
            buildTrackSearchDocuments({
              trackId: track.id,
              tenantId: input.tenantId,
            }),
          ),
        )
      ).flat();
      return [...gameDocuments, ...trackDocuments];
    }
    case "post":
      return buildPostSearchDocuments({
        postId: input.entityId,
        tenantId: input.tenantId,
      });
    case "team":
      return buildTeamSearchDocuments({
        teamId: input.entityId,
        tenantId: input.tenantId,
      });
    case "track":
      return buildTrackSearchDocuments({
        trackId: input.entityId,
        tenantId: input.tenantId,
      });
    case "user":
      return buildUserSearchDocuments({
        userId: input.entityId,
        tenantId: input.tenantId,
      });
    default:
      return [];
  }
}

function uniqueEntityTypes(documents: SearchDocumentRecord[]) {
  return [...new Set(documents.map((document) => document.entityType))];
}

export async function indexSearchEntity(input: {
  entityType: SearchIndexEntityType;
  entityId: number;
  tenantId?: string | null;
}) {
  const startedAt = Date.now();
  const documents = await buildDocumentsForEntity(input);
  const entityTypesToClear =
    input.entityType === "game"
      ? (["game", "track"] satisfies SearchIndexEntityType[])
      : ([input.entityType] satisfies SearchIndexEntityType[]);

  for (const entityType of entityTypesToClear) {
    if (entityType === "track" && input.entityType === "game") {
      const trackIds = await db.gamePageTrack.findMany({
        where: {
          gamePage: {
            gameId: input.entityId,
          },
        },
        select: {
          id: true,
        },
      });
      for (const track of trackIds) {
        await deleteSearchDocumentsForEntity({
          tenantId: input.tenantId,
          entityType: "track",
          entityId: track.id,
        });
      }
      continue;
    }

    await deleteSearchDocumentsForEntity({
      tenantId: input.tenantId,
      entityType,
      entityId: input.entityId,
    });
  }

  if (documents.length > 0) {
    await upsertSearchDocuments(documents);
  }

  const durationMs = Date.now() - startedAt;
  for (const entityType of uniqueEntityTypes(documents).length > 0
    ? uniqueEntityTypes(documents)
    : entityTypesToClear) {
    recordSearchIndexing({
      entityType,
      documentCount: documents.filter((document) => document.entityType === entityType).length,
      durationMs,
    });
  }
  clearSearchCache();
}

export async function enqueueSearchEntityIndex(input: {
  entityType: SearchIndexEntityType;
  entityId: number;
  tenantId?: string | null;
}) {
  await enqueueJob({
    type: "search.index.entity",
    payload: {
      entityType: input.entityType,
      entityId: input.entityId,
      tenantId: input.tenantId ?? null,
    },
  });
}

async function countTrackedEntitiesForTenant(tenantId?: string | null) {
  const strictIsolation = appConfig.platform.multiTenant.strictIsolation;
  const [userCount, postCount, teamCount, gameCount] = await Promise.all([
    countCoreEntitiesByTenant({
      entityType: "User",
      tenantId,
      strictIsolation,
    }),
    countCoreEntitiesByTenant({
      entityType: "Post",
      tenantId,
      strictIsolation,
    }),
    countCoreEntitiesByTenant({
      entityType: "Team",
      tenantId,
      strictIsolation,
    }),
    countCoreEntitiesByTenant({
      entityType: "Game",
      tenantId,
      strictIsolation,
    }),
  ]);

  return {
    user: userCount,
    post: postCount,
    team: teamCount,
    game: gameCount,
  };
}

async function fetchReindexBatchIds(input: {
  entityType: ReindexEntityType;
  tenantId?: string | null;
  batchSize: number;
  afterId?: number | null;
}) {
  const normalizedTenantId =
    input.tenantId ?? appConfig.platform.multiTenant.defaultTenantId;
  const strictIsolation = appConfig.platform.multiTenant.strictIsolation;
  const entityTypeMap = {
    user: "User",
    post: "Post",
    team: "Team",
    game: "Game",
  } as const;

  return listCoreEntitiesByTenantPage({
    entityType: entityTypeMap[input.entityType],
    tenantId: normalizedTenantId,
    strictIsolation,
    limit: input.batchSize,
    afterId: input.afterId ?? null,
  });
}

export async function startSearchReindexRun(input: {
  tenantId?: string | null;
  scope?: "tenant" | "global";
  batchSize?: number;
}) {
  const batchSize = Math.min(Math.max(input.batchSize ?? 100, 10), 500);
  const tenantId =
    input.scope === "global"
      ? null
      : input.tenantId ?? appConfig.platform.multiTenant.defaultTenantId;
  const counts = await countTrackedEntitiesForTenant(tenantId);
  const runId = randomUUID();
  const perEntityState = Object.fromEntries(
    REINDEX_ENTITY_TYPES.map((entityType) => [
      entityType,
      { cursor: null, done: false },
    ]),
  ) as Record<ReindexEntityType, { cursor: number | null; done: boolean }>;

  await createSearchReindexRun({
    id: runId,
    tenantId,
    scope: input.scope ?? "tenant",
    batchSize,
    entityTypes: [...REINDEX_ENTITY_TYPES],
    perEntityState,
    totalCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
  });

  await enqueueJob({
    type: "search.reindex.run",
    payload: {
      runId,
    },
  });

  return runId;
}

export async function processSearchReindexRun(runId: string) {
  const run = await getSearchReindexRunById(runId);
  if (!run || run.status === "completed") {
    return;
  }

  const startedAt = run.startedAt ?? new Date().toISOString();
  await updateSearchReindexRun({
    id: runId,
    status: "running",
    startedAt,
    lastError: null,
  });

  const nextEntityType = REINDEX_ENTITY_TYPES.find(
    (entityType) => !run.perEntityState[entityType]?.done,
  );

  if (!nextEntityType) {
    await updateSearchReindexRun({
      id: runId,
      status: "completed",
      completedAt: new Date().toISOString(),
      perEntityState: run.perEntityState,
    });
    return;
  }

  const state = run.perEntityState[nextEntityType] ?? {
    cursor: null,
    done: false,
  };
  const batchIds = await fetchReindexBatchIds({
    entityType: nextEntityType,
    tenantId: run.scope === "global" ? null : run.tenantId,
    batchSize: run.batchSize,
    afterId: state.cursor,
  });

  if (batchIds.length === 0) {
    const nextState = {
      ...run.perEntityState,
      [nextEntityType]: {
        cursor: state.cursor ?? null,
        done: true,
      },
    };
    await updateSearchReindexRun({
      id: runId,
      perEntityState: nextState,
      processedCount: run.processedCount,
    });
    await enqueueJob({
      type: "search.reindex.run",
      payload: {
        runId,
      },
    });
    return;
  }

  for (const entityId of batchIds) {
    await indexSearchEntity({
      entityType: nextEntityType,
      entityId,
      tenantId: run.scope === "global" ? null : run.tenantId,
    });
  }

  const nextState = {
    ...run.perEntityState,
    [nextEntityType]: {
      cursor: batchIds[batchIds.length - 1] ?? state.cursor ?? null,
      done: false,
    },
  };

  await updateSearchReindexRun({
    id: runId,
    perEntityState: nextState,
    processedCount: run.processedCount + batchIds.length,
  });

  await enqueueJob({
    type: "search.reindex.run",
    payload: {
      runId,
    },
  });
}

export async function failSearchReindexRun(runId: string, error: unknown) {
  await updateSearchReindexRun({
    id: runId,
    status: "failed",
    lastError: error instanceof Error ? error.message : String(error),
  });
}

export async function resumePendingSearchReindexRuns() {
  const runs = await listSearchReindexRuns({ limit: 20 });
  for (const run of runs) {
    if (run.status === "pending" || run.status === "running" || run.status === "failed") {
      await enqueueJob({
        type: "search.reindex.run",
        payload: {
          runId: run.id,
        },
      });
    }
  }
}

export async function reindexTenantSearchDocuments(tenantId?: string | null) {
  return startSearchReindexRun({
    tenantId,
    scope: "tenant",
  });
}

export async function reindexAllSearchDocuments() {
  return startSearchReindexRun({
    scope: "global",
  });
}
