import logger from "../../infra/logger.js";
import {
  getSearchIndexStats,
  listSearchReindexRuns,
} from "../../infra/searchStore.js";
import { startSearchReindexRun } from "./indexing.service.js";

type SearchReadinessStatus = {
  ready: boolean;
  reason: "ready" | "empty-index" | "reindex-running" | "reindex-failed";
  documentCount: number;
  activeRunId: string | null;
};

const bootstrapByTenant = new Map<string, Promise<void>>();

function normalizeTenantId(tenantId?: string | null) {
  return tenantId ?? "default";
}

export async function getSearchReadinessStatus(
  tenantId?: string | null,
): Promise<SearchReadinessStatus> {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const [indexStats, runs] = await Promise.all([
    getSearchIndexStats(tenantId),
    listSearchReindexRuns({ tenantId: normalizedTenantId, limit: 20 }),
  ]);

  const activeRun =
    runs.find((run) => run.status === "running" || run.status === "pending") ?? null;
  const failedRun = runs.find((run) => run.status === "failed") ?? null;

  if (indexStats.documentCount > 0) {
    return {
      ready: true,
      reason: "ready",
      documentCount: indexStats.documentCount,
      activeRunId: activeRun?.id ?? null,
    };
  }

  if (activeRun) {
    return {
      ready: false,
      reason: "reindex-running",
      documentCount: 0,
      activeRunId: activeRun.id,
    };
  }

  if (failedRun) {
    return {
      ready: false,
      reason: "reindex-failed",
      documentCount: 0,
      activeRunId: failedRun.id,
    };
  }

  return {
    ready: false,
    reason: "empty-index",
    documentCount: 0,
    activeRunId: null,
  };
}

export async function ensureSearchBootstrap(tenantId?: string | null) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const existing = bootstrapByTenant.get(normalizedTenantId);
  if (existing) {
    return existing;
  }

  const bootstrapPromise = (async () => {
    const readiness = await getSearchReadinessStatus(tenantId);
    if (readiness.ready || readiness.activeRunId) {
      return;
    }

    const runId = await startSearchReindexRun({
      tenantId,
      scope: "tenant",
    });
    logger.info("Queued search bootstrap reindex", {
      tenantId: normalizedTenantId,
      runId,
    });
  })()
    .catch((error) => {
      logger.error("Failed to queue search bootstrap reindex", {
        tenantId: normalizedTenantId,
        error,
      });
      throw error;
    })
    .finally(() => {
      bootstrapByTenant.delete(normalizedTenantId);
    });

  bootstrapByTenant.set(normalizedTenantId, bootstrapPromise);
  return bootstrapPromise;
}
