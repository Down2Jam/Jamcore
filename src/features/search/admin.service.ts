import { randomUUID } from "node:crypto";
import { z } from "zod";

import { enqueueJob } from "../../infra/jobQueue.js";
import { listJobsFromDb } from "../../infra/platformStore.js";
import {
  getSearchIndexStats,
  getSearchReindexRunById,
  listSearchReindexRuns,
} from "../../infra/searchStore.js";
import { getSearchReadinessStatus } from "./readiness.js";
import { NotFoundError } from "../../lib/errors.js";
import {
  createSearchSynonymInDb,
  deleteSearchSynonymInDb,
  getSearchSettingsFromDb,
  listSearchSynonymsFromDb,
  updateSearchSynonymGroupInDb,
  upsertSearchSettingsInDb,
} from "../../infra/platformStore.js";
import { startSearchReindexRun } from "./indexing.service.js";

const DEFAULT_SEARCH_SETTINGS = {
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
} as const;

export const createSearchSynonymSchema = z.object({
  term: z.string().trim().min(1),
  synonym: z.string().trim().min(1),
  groupKey: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const createSearchSynonymGroupSchema = z.object({
  groupKey: z.string().trim().min(1).optional(),
  terms: z.array(z.string().trim().min(1)).min(2),
  notes: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const deleteSearchSynonymSchema = z.object({
  id: z.string().trim().min(1),
});

export const updateSearchSynonymGroupSchema = z.object({
  groupKey: z.string().trim().min(1),
  notes: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const updateSearchSettingsSchema = z.object({
  exactMatchBoost: z.number().finite().positive().optional(),
  prefixMatchBoost: z.number().finite().positive().optional(),
  substringMatchBoost: z.number().finite().positive().optional(),
  fuzzyThreshold: z.number().finite().min(0).max(1).optional(),
  gameWeight: z.number().finite().positive().optional(),
  trackWeight: z.number().finite().positive().optional(),
  postWeight: z.number().finite().positive().optional(),
  userWeight: z.number().finite().positive().optional(),
  teamWeight: z.number().finite().positive().optional(),
  freshnessHalfLifeHours: z.number().finite().positive().optional(),
});

export const searchReindexSchema = z.object({
  scope: z.enum(["tenant", "global"]).optional().default("tenant"),
  batchSize: z.number().int().min(10).max(500).optional(),
  runId: z.string().trim().min(1).optional(),
});

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

export async function listSearchAdminState(tenantId?: string | null) {
  const [synonyms, settings, indexStats, jobs, reindexRuns, readiness] = await Promise.all([
    listSearchSynonymsFromDb(tenantId),
    getSearchTuning(tenantId),
    getSearchIndexStats(tenantId),
    listJobsFromDb(100),
    listSearchReindexRuns({ tenantId, limit: 20 }),
    getSearchReadinessStatus(tenantId),
  ]);

  const synonymGroups = Object.values(
    synonyms.reduce<Record<string, {
      groupKey: string;
      enabled: boolean;
      notes: string | null;
      terms: string[];
      ids: string[];
    }>>((acc, synonym) => {
      const key = synonym.groupKey ?? `${synonym.term}:${synonym.synonym}`;
      const current = acc[key] ?? {
        groupKey: key,
        enabled: true,
        notes: null,
        terms: [],
        ids: [],
      };
      current.enabled = current.enabled && Boolean(synonym.enabled);
      current.notes = synonym.notes ?? current.notes;
      current.ids.push(synonym.id);
      current.terms.push(synonym.term, synonym.synonym);
      acc[key] = current;
      return acc;
    }, {}),
  ).map((group) => ({
    ...group,
    terms: [...new Set(group.terms)],
  }));

  return {
    synonyms,
    synonymGroups,
    settings,
    indexStats,
    readiness,
    reindexRuns,
    jobs: jobs
      .filter((job) => job.type.startsWith("search."))
      .map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        runAt: job.runAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        lastError: job.lastError,
      })),
  };
}

export async function createSearchSynonym(
  input: z.infer<typeof createSearchSynonymSchema>,
  tenantId?: string | null,
) {
  await createSearchSynonymInDb({
    id: randomUUID(),
    tenantId,
    term: normalizeToken(input.term),
    synonym: normalizeToken(input.synonym),
    groupKey: input.groupKey?.trim() || null,
    notes: input.notes?.trim() || null,
    enabled: input.enabled ?? true,
  });
}

export async function createSearchSynonymGroup(
  input: z.infer<typeof createSearchSynonymGroupSchema>,
  tenantId?: string | null,
) {
  const normalizedTerms = [...new Set(input.terms.map(normalizeToken))];
  const groupKey = input.groupKey?.trim() || randomUUID();

  for (const term of normalizedTerms) {
    for (const synonym of normalizedTerms) {
      if (term === synonym) {
        continue;
      }
      await createSearchSynonymInDb({
        id: randomUUID(),
        tenantId,
        term,
        synonym,
        groupKey,
        notes: input.notes?.trim() || null,
        enabled: input.enabled ?? true,
      });
    }
  }

  return groupKey;
}

export async function deleteSearchSynonym(
  id: string,
  tenantId?: string | null,
) {
  await deleteSearchSynonymInDb(id, tenantId);
}

export async function updateSearchSynonymGroup(
  input: z.infer<typeof updateSearchSynonymGroupSchema>,
  tenantId?: string | null,
) {
  await updateSearchSynonymGroupInDb({
    groupKey: input.groupKey,
    tenantId,
    notes: input.notes?.trim() || null,
    enabled: input.enabled,
  });
}

export async function updateSearchSettings(
  input: z.infer<typeof updateSearchSettingsSchema>,
  tenantId?: string | null,
) {
  const current = await getSearchTuning(tenantId);
  await upsertSearchSettingsInDb({
    tenantId,
    exactMatchBoost: input.exactMatchBoost ?? current.exactMatchBoost,
    prefixMatchBoost: input.prefixMatchBoost ?? current.prefixMatchBoost,
    substringMatchBoost: input.substringMatchBoost ?? current.substringMatchBoost,
    fuzzyThreshold: input.fuzzyThreshold ?? current.fuzzyThreshold,
    gameWeight: input.gameWeight ?? current.gameWeight,
    trackWeight: input.trackWeight ?? current.trackWeight,
    postWeight: input.postWeight ?? current.postWeight,
    userWeight: input.userWeight ?? current.userWeight,
    teamWeight: input.teamWeight ?? current.teamWeight,
    freshnessHalfLifeHours:
      input.freshnessHalfLifeHours ?? current.freshnessHalfLifeHours,
  });
}

export async function getSearchTuning(tenantId?: string | null) {
  const stored = await getSearchSettingsFromDb(tenantId);
  if (!stored) {
    return DEFAULT_SEARCH_SETTINGS;
  }

  return {
    exactMatchBoost: stored.exactMatchBoost,
    prefixMatchBoost: stored.prefixMatchBoost,
    substringMatchBoost: stored.substringMatchBoost,
    fuzzyThreshold: stored.fuzzyThreshold,
    gameWeight: stored.gameWeight,
    trackWeight: stored.trackWeight,
    postWeight: stored.postWeight,
    userWeight: stored.userWeight,
    teamWeight: stored.teamWeight,
    freshnessHalfLifeHours: stored.freshnessHalfLifeHours,
  };
}

export async function expandSearchTerms(query: string, tenantId?: string | null) {
  const normalizedQuery = normalizeToken(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const synonyms = await listSearchSynonymsFromDb(tenantId);
  const expanded = new Set<string>([normalizedQuery, ...queryTokens]);
  const groups = new Map<string, Set<string>>();

  for (const entry of synonyms) {
    if (!entry.enabled) {
      continue;
    }
    if (entry.groupKey) {
      const groupTerms = groups.get(entry.groupKey) ?? new Set<string>();
      groupTerms.add(normalizeToken(entry.term));
      groupTerms.add(normalizeToken(entry.synonym));
      groups.set(entry.groupKey, groupTerms);
    }
  }

  for (const entry of synonyms) {
    if (!entry.enabled) {
      continue;
    }
    const term = normalizeToken(entry.term);
    const synonym = normalizeToken(entry.synonym);
    if (
      normalizedQuery.includes(term) ||
      normalizedQuery.includes(synonym) ||
      queryTokens.includes(term) ||
      queryTokens.includes(synonym)
    ) {
      expanded.add(term);
      expanded.add(synonym);
      if (entry.groupKey) {
        for (const groupedTerm of groups.get(entry.groupKey) ?? []) {
          expanded.add(groupedTerm);
        }
      }
    }
  }

  return [...expanded].filter(Boolean);
}

export async function enqueueSearchReindex(input: {
  tenantId?: string | null;
  scope?: "tenant" | "global";
  batchSize?: number;
  runId?: string;
}) {
  if (input.runId) {
    const existingRun = await getSearchReindexRunById(input.runId);
    if (!existingRun) {
      throw new NotFoundError("Search reindex run not found");
    }
    await enqueueJob({
      type: "search.reindex.run",
      payload: {
        runId: existingRun.id,
      },
    });
    return existingRun.id;
  }

  return startSearchReindexRun({
    tenantId: input.tenantId,
    scope: input.scope ?? "tenant",
    batchSize: input.batchSize,
  });
}
