import db from "./db.js";
import logger from "./logger.js";
import { ConfigurationError } from "../lib/errors.js";

export type SearchDocumentRecord = {
  documentId: string;
  tenantId: string | null;
  entityType: "game" | "user" | "post" | "track" | "team";
  entityId: number;
  variant: string | null;
  title: string;
  subtitle: string | null;
  body: string | null;
  slug: string | null;
  tags: string[];
  visibility: "public" | "hidden";
  metadata: Record<string, unknown>;
  sourceUpdatedAt: string;
  indexedAt: string;
};

type SearchResultRow = SearchDocumentRecord & {
  score: number;
};

export type SearchReindexRunRecord = {
  id: string;
  tenantId: string | null;
  scope: "tenant" | "global";
  status: "pending" | "running" | "completed" | "failed";
  batchSize: number;
  entityTypes: string[];
  perEntityState: Record<string, { cursor: number | null; done: boolean }>;
  totalCount: number;
  processedCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

let ensured = false;

const REQUIRED_SEARCH_TABLES = [
  "SearchDocument",
  "SearchReindexRun",
] as const;

function supportsRawSql() {
  return (
    typeof (db as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function" &&
    typeof (db as { $queryRawUnsafe?: unknown }).$queryRawUnsafe === "function"
  );
}

function parseJson<TValue>(value: unknown, fallback: TValue): TValue {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as TValue;
    } catch {
      return fallback;
    }
  }

  return value as TValue;
}

function normalizeTenantId(tenantId?: string | null) {
  return tenantId ?? "default";
}

function mapRow(row: Record<string, unknown>): SearchDocumentRecord {
  return {
    documentId: String(row.documentId),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    entityType: String(row.entityType) as SearchDocumentRecord["entityType"],
    entityId: Number(row.entityId),
    variant: row.variant ? String(row.variant) : null,
    title: String(row.title ?? ""),
    subtitle: row.subtitle ? String(row.subtitle) : null,
    body: row.body ? String(row.body) : null,
    slug: row.slug ? String(row.slug) : null,
    tags: parseJson<string[]>(row.tags, []),
    visibility: String(row.visibility ?? "public") as SearchDocumentRecord["visibility"],
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    sourceUpdatedAt: new Date(String(row.sourceUpdatedAt)).toISOString(),
    indexedAt: new Date(String(row.indexedAt)).toISOString(),
  };
}

function mapReindexRunRow(row: Record<string, unknown>): SearchReindexRunRecord {
  return {
    id: String(row.id),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    scope: String(row.scope) as SearchReindexRunRecord["scope"],
    status: String(row.status) as SearchReindexRunRecord["status"],
    batchSize: Number(row.batchSize ?? 100),
    entityTypes: parseJson<string[]>(row.entityTypes, []),
    perEntityState: parseJson<Record<string, { cursor: number | null; done: boolean }>>(
      row.perEntityState,
      {},
    ),
    totalCount: Number(row.totalCount ?? 0),
    processedCount: Number(row.processedCount ?? 0),
    lastError: row.lastError ? String(row.lastError) : null,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
    startedAt: row.startedAt ? new Date(String(row.startedAt)).toISOString() : null,
    completedAt: row.completedAt ? new Date(String(row.completedAt)).toISOString() : null,
  };
}

export async function ensureSearchTables() {
  if (ensured) {
    return;
  }

  if (!supportsRawSql()) {
    ensured = true;
    return;
  }

  const [extensionRows, tableRows, columnRows] = await Promise.all([
    db.$queryRawUnsafe(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
    ) as Promise<Array<{ extname: string }>>,
    db.$queryRawUnsafe(
      `
        SELECT table_name AS "tableName"
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
      `,
      [...REQUIRED_SEARCH_TABLES],
    ) as Promise<Array<{ tableName: string }>>,
    db.$queryRawUnsafe(
      `
        SELECT column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'SearchDocument'
          AND column_name = 'document_tsv'
      `,
    ) as Promise<Array<{ columnName: string }>>,
  ]);

  const missingTables = REQUIRED_SEARCH_TABLES.filter(
    (tableName) => !tableRows.some((row) => row.tableName === tableName),
  );
  const hasTrgm = extensionRows.some((row) => row.extname === "pg_trgm");
  const hasDocumentTsv = columnRows.some((row) => row.columnName === "document_tsv");

  if (!hasTrgm || missingTables.length > 0 || !hasDocumentTsv) {
    logger.error("Search schema is missing required database objects", {
      hasTrgm,
      missingTables,
      missingColumns: hasDocumentTsv ? [] : ["SearchDocument.document_tsv"],
    });
    throw new ConfigurationError(
      "Search schema is missing required database objects. Run the latest database migrations.",
      {
        missingTables,
        missingExtensions: hasTrgm ? [] : ["pg_trgm"],
        missingColumns: hasDocumentTsv ? [] : ["SearchDocument.document_tsv"],
      },
    );
  }

  ensured = true;
}

export async function upsertSearchDocuments(documents: SearchDocumentRecord[]) {
  await ensureSearchTables();
  if (!supportsRawSql() || documents.length === 0) {
    return;
  }

  for (const document of documents) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO "SearchDocument" (
          document_id,
          tenant_id,
          entity_type,
          entity_id,
          variant,
          title,
          subtitle,
          body,
          slug,
          tags,
          visibility,
          metadata,
          source_updated_at,
          indexed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13::timestamptz, NOW())
        ON CONFLICT (document_id)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          entity_type = EXCLUDED.entity_type,
          entity_id = EXCLUDED.entity_id,
          variant = EXCLUDED.variant,
          title = EXCLUDED.title,
          subtitle = EXCLUDED.subtitle,
          body = EXCLUDED.body,
          slug = EXCLUDED.slug,
          tags = EXCLUDED.tags,
          visibility = EXCLUDED.visibility,
          metadata = EXCLUDED.metadata,
          source_updated_at = EXCLUDED.source_updated_at,
          indexed_at = NOW()
      `,
      document.documentId,
      normalizeTenantId(document.tenantId),
      document.entityType,
      document.entityId,
      document.variant,
      document.title,
      document.subtitle,
      document.body,
      document.slug,
      JSON.stringify(document.tags),
      document.visibility,
      JSON.stringify(document.metadata),
      document.sourceUpdatedAt,
    );
  }
}

export async function deleteSearchDocumentsForEntity(input: {
  tenantId?: string | null;
  entityType: SearchDocumentRecord["entityType"];
  entityId: number;
}) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      DELETE FROM "SearchDocument"
      WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
    `,
    normalizeTenantId(input.tenantId),
    input.entityType,
    input.entityId,
  );
}

export async function querySearchDocuments(input: {
  tenantId?: string | null;
  entityTypes: SearchDocumentRecord["entityType"][];
  query: string;
  terms: string[];
  limit: number;
  exactMatchBoost: number;
  prefixMatchBoost: number;
  substringMatchBoost: number;
  fuzzyThreshold: number;
  freshnessHalfLifeHours?: number;
  entityTypeWeights?: Partial<Record<SearchDocumentRecord["entityType"], number>>;
}) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return [];
  }

  const limit = Math.min(Math.max(input.limit, 1), 50);
  const expandedTerms = [...new Set([input.query, ...input.terms].map((value) => value.trim()).filter(Boolean))];
  const queryString = expandedTerms.join(" OR ");

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        document_id AS "documentId",
        tenant_id AS "tenantId",
        entity_type AS "entityType",
        entity_id AS "entityId",
        variant,
        title,
        subtitle,
        body,
        slug,
        tags,
        visibility,
        metadata,
        source_updated_at AS "sourceUpdatedAt",
        indexed_at AS "indexedAt",
        (
          ts_rank(document_tsv, websearch_to_tsquery('simple', $3))
          + CASE WHEN lower(title) = lower($4) THEN $5 ELSE 0 END
          + CASE WHEN lower(title) LIKE lower($4 || '%') THEN $6 ELSE 0 END
          + CASE WHEN lower(title) LIKE lower('%' || $4 || '%') THEN $7 ELSE 0 END
          + GREATEST(similarity(coalesce(title, ''), $4), similarity(coalesce(slug, ''), $4))
          + CASE entity_type
              WHEN 'game' THEN $9
              WHEN 'track' THEN $10
              WHEN 'post' THEN $11
              WHEN 'user' THEN $12
              WHEN 'team' THEN $13
              ELSE 1
            END
          + CASE
              WHEN entity_type = 'post'
              THEN exp(
                -LN(2)
                * (EXTRACT(EPOCH FROM (NOW() - source_updated_at)) / 3600.0)
                / GREATEST($14, 1)
              )
              ELSE 0
            END
        ) AS score
      FROM "SearchDocument"
      WHERE tenant_id = $1
        AND visibility = 'public'
        AND entity_type = ANY($2::text[])
        AND (
          document_tsv @@ websearch_to_tsquery('simple', $3)
          OR similarity(coalesce(title, ''), $4) > $8
          OR similarity(coalesce(slug, ''), $4) > $8
        )
      ORDER BY score DESC, source_updated_at DESC
      LIMIT $15
    `,
    normalizeTenantId(input.tenantId),
    input.entityTypes,
    queryString,
    input.query,
    input.exactMatchBoost,
    input.prefixMatchBoost,
    input.substringMatchBoost,
    input.fuzzyThreshold,
    input.entityTypeWeights?.game ?? 1,
    input.entityTypeWeights?.track ?? 1,
    input.entityTypeWeights?.post ?? 1,
    input.entityTypeWeights?.user ?? 1,
    input.entityTypeWeights?.team ?? 1,
    input.freshnessHalfLifeHours ?? 168,
    limit,
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    ...mapRow(row),
    score: Number(row.score ?? 0),
  })) satisfies SearchResultRow[];
}

export async function listSearchDocumentsByEntity(input: {
  tenantId?: string | null;
  entityType?: SearchDocumentRecord["entityType"];
  entityId?: number;
  limit?: number;
}) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return [];
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        document_id AS "documentId",
        tenant_id AS "tenantId",
        entity_type AS "entityType",
        entity_id AS "entityId",
        variant,
        title,
        subtitle,
        body,
        slug,
        tags,
        visibility,
        metadata,
        source_updated_at AS "sourceUpdatedAt",
        indexed_at AS "indexedAt"
      FROM "SearchDocument"
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR entity_type = $2)
        AND ($3::int IS NULL OR entity_id = $3)
      ORDER BY indexed_at DESC
      LIMIT $4
    `,
    normalizeTenantId(input.tenantId),
    input.entityType ?? null,
    input.entityId ?? null,
    input.limit ?? 100,
  )) as Array<Record<string, unknown>>;

  return rows.map(mapRow);
}

export async function getSearchIndexStats(tenantId?: string | null) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return {
      documentCount: 0,
      staleCount: 0,
      byType: {},
      lastIndexedAt: null,
    };
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        entity_type AS "entityType",
        COUNT(*)::int AS count,
        MAX(indexed_at) AS "lastIndexedAt",
        SUM(CASE WHEN indexed_at < source_updated_at THEN 1 ELSE 0 END)::int AS stale
      FROM "SearchDocument"
      WHERE tenant_id = $1
      GROUP BY entity_type
      ORDER BY entity_type ASC
    `,
    normalizeTenantId(tenantId),
  )) as Array<Record<string, unknown>>;

  const byType = Object.fromEntries(
    rows.map((row) => [
      String(row.entityType),
      {
        count: Number(row.count ?? 0),
        stale: Number(row.stale ?? 0),
        lastIndexedAt: row.lastIndexedAt ? new Date(String(row.lastIndexedAt)).toISOString() : null,
      },
    ]),
  );

  const documentCount = rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const staleCount = rows.reduce((sum, row) => sum + Number(row.stale ?? 0), 0);
  const lastIndexedAt = rows
    .map((row) => row.lastIndexedAt ? new Date(String(row.lastIndexedAt)).toISOString() : null)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    documentCount,
    staleCount,
    byType,
    lastIndexedAt,
  };
}

export async function createSearchReindexRun(input: {
  id: string;
  tenantId?: string | null;
  scope: "tenant" | "global";
  batchSize: number;
  entityTypes: string[];
  perEntityState: Record<string, { cursor: number | null; done: boolean }>;
  totalCount: number;
}) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "SearchReindexRun" (
        id, tenant_id, scope, status, batch_size, entity_types, per_entity_state, total_count, processed_count
      )
      VALUES ($1, $2, $3, 'pending', $4, $5::jsonb, $6::jsonb, $7, 0)
    `,
    input.id,
    input.tenantId ?? null,
    input.scope,
    input.batchSize,
    JSON.stringify(input.entityTypes),
    JSON.stringify(input.perEntityState),
    input.totalCount,
  );
}

export async function getSearchReindexRunById(id: string) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return null;
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        scope,
        status,
        batch_size AS "batchSize",
        entity_types AS "entityTypes",
        per_entity_state AS "perEntityState",
        total_count AS "totalCount",
        processed_count AS "processedCount",
        last_error AS "lastError",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM "SearchReindexRun"
      WHERE id = $1
      LIMIT 1
    `,
    id,
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  return row ? mapReindexRunRow(row) : null;
}

export async function listSearchReindexRuns(input?: {
  tenantId?: string | null;
  limit?: number;
}) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return [];
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        scope,
        status,
        batch_size AS "batchSize",
        entity_types AS "entityTypes",
        per_entity_state AS "perEntityState",
        total_count AS "totalCount",
        processed_count AS "processedCount",
        last_error AS "lastError",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        started_at AS "startedAt",
        completed_at AS "completedAt"
      FROM "SearchReindexRun"
      WHERE ($1::text IS NULL OR tenant_id = $1)
      ORDER BY created_at DESC
      LIMIT $2
    `,
    input?.tenantId ?? null,
    input?.limit ?? 20,
  )) as Array<Record<string, unknown>>;
  return rows.map(mapReindexRunRow);
}

export async function updateSearchReindexRun(input: {
  id: string;
  status?: SearchReindexRunRecord["status"];
  perEntityState?: Record<string, { cursor: number | null; done: boolean }>;
  processedCount?: number;
  lastError?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  await ensureSearchTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "SearchReindexRun"
      SET
        status = COALESCE($2, status),
        per_entity_state = COALESCE($3::jsonb, per_entity_state),
        processed_count = COALESCE($4, processed_count),
        last_error = $5,
        started_at = COALESCE($6::timestamptz, started_at),
        completed_at = $7::timestamptz,
        updated_at = NOW()
      WHERE id = $1
    `,
    input.id,
    input.status ?? null,
    input.perEntityState ? JSON.stringify(input.perEntityState) : null,
    input.processedCount ?? null,
    input.lastError ?? null,
    input.startedAt ?? null,
    input.completedAt ?? null,
  );
}
