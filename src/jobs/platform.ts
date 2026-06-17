import { appConfig } from "../config/app.js";
import { getCurrentActiveJam } from "../features/jams/index.js";
import {
  failSearchReindexRun,
  indexSearchEntity,
  processSearchReindexRun,
  reindexAllSearchDocuments,
  reindexTenantSearchDocuments,
  resumePendingSearchReindexRuns,
} from "../features/search/indexing.service.js";
import { clearSearchCache } from "../features/search/service.js";
import { listGames } from "../features/games/listing.service.js";
import { listJobs, enqueueJob, startJobWorker } from "../infra/jobQueue.js";
import logger from "../infra/logger.js";
import { emitDomainEvent } from "../lib/domainEvents.js";
import { deliverWebhookJob } from "../infra/webhooks.js";

async function precomputeHotCaches() {
  await getCurrentActiveJam();

  const sorts = appConfig.platform.precompute.sorts;
  for (const sort of sorts) {
    await listGames({
      sort,
      pageVersion: "JAM",
      limit: 24,
    });
    await listGames({
      sort,
      pageVersion: "POST_JAM",
      limit: 24,
    });
  }
}

async function runSearchReindex(payload: Record<string, unknown>) {
  const runId =
    payload.scope === "global"
      ? await reindexAllSearchDocuments()
      : await reindexTenantSearchDocuments(
          typeof payload.tenantId === "string" ? payload.tenantId : null,
        );
  if (payload.scope === "global") {
    clearSearchCache();
  }
  await emitDomainEvent({
    type: "search.reindex.queued",
    tenantId:
      typeof payload.tenantId === "string" && payload.tenantId.length > 0
        ? payload.tenantId
        : undefined,
    payload: {
      runId,
      scope: payload.scope ?? "tenant",
      tenantId: payload.tenantId ?? null,
    },
  });
}

async function runSearchReindexRun(payload: Record<string, unknown>) {
  const runId = typeof payload.runId === "string" ? payload.runId : null;
  if (!runId) {
    return;
  }
  try {
    await processSearchReindexRun(runId);
  } catch (error) {
    await failSearchReindexRun(runId, error);
    throw error;
  }
}

async function runSearchEntityIndex(payload: Record<string, unknown>) {
  const entityType = String(payload.entityType ?? "") as
    | "game"
    | "user"
    | "post"
    | "track"
    | "team";
  const entityId = Number(payload.entityId);
  if (!entityType || !Number.isInteger(entityId)) {
    return;
  }

  await indexSearchEntity({
    entityType,
    entityId,
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
  });
}

export function startPlatformRuntime() {
  if (!appConfig.platform.precompute.enabled) {
    return {
      name: "platform-runtime",
      stop: () => undefined,
    };
  }

  const worker = startJobWorker({
    "cache.precompute": async () => {
      await precomputeHotCaches();
    },
    "search.index.entity": async (job) => {
      await runSearchEntityIndex(job.payload);
    },
    "search.reindex.run": async (job) => {
      await runSearchReindexRun(job.payload);
    },
    "search.reindex": async (job) => {
      await runSearchReindex(job.payload);
    },
    "webhook.delivery": async (job) => {
      await deliverWebhookJob(job.payload);
    },
  });

  const interval = setInterval(async () => {
    const jobs = await listJobs(50);
    const hasPendingPrecompute = jobs.some(
      (job) => job.type === "cache.precompute" && job.status !== "dead",
    );
    if (!hasPendingPrecompute) {
      await enqueueJob({
        type: "cache.precompute",
        payload: {},
      });
    }
  }, appConfig.platform.precompute.intervalMs);

  interval.unref?.();
  logger.info("Platform runtime started");
  void resumePendingSearchReindexRuns();
  void enqueueJob({
    type: "cache.precompute",
    payload: {},
  });

  return {
    name: "platform-runtime",
    stop: () => {
      worker.stop?.();
      clearInterval(interval);
    },
  };
}
