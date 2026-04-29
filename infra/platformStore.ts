import { createHash, randomBytes } from "node:crypto";

import db from "./db.js";
import logger from "./logger.js";
import { ConfigurationError } from "../lib/errors.js";

type JsonRecord = Record<string, unknown>;

type PersistedServiceKeyRow = {
  id: string;
  name: string;
  scopes: string[];
  tenantId: string | null;
  createdAt: Date;
  deprecatedAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  keyPrefix: string;
  keyHash: string;
  usageCount: number;
};

type PersistedJobRow = {
  id: string;
  type: string;
  payload: JsonRecord;
  status: string;
  attempts: number;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastError: string | null;
  lockedAt: Date | null;
  lockToken: string | null;
};

type PersistedIdempotencyRow = {
  idempotencyKey: string;
  requestHash: string;
  status: string;
  responseStatus: number | null;
  responseKind: string | null;
  responseBody: unknown;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

type PersistedEventRow = {
  eventId: string;
  type: string;
  tenantId: string | null;
  payload: JsonRecord;
  occurredAt: Date;
};

type PersistedWebhookSubscriptionRow = {
  id: string;
  endpoint: string;
  events: string[];
  secret: string | null;
  headers: JsonRecord | null;
  tenantId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
  failureCount: number;
};

type PersistedSearchSettingsRow = {
  tenantId: string | null;
  exactMatchBoost: number;
  prefixMatchBoost: number;
  substringMatchBoost: number;
  fuzzyThreshold: number;
  gameWeight: number;
  trackWeight: number;
  postWeight: number;
  userWeight: number;
  teamWeight: number;
  freshnessHalfLifeHours: number;
  updatedAt: Date;
};

let ensured = false;

const REQUIRED_PLATFORM_TABLES = [
  "ServiceKey",
  "PlatformJob",
  "IdempotencyRecord",
  "DomainEvent",
  "WebhookSubscription",
  "EventCheckpoint",
  "RoleGrant",
  "SearchSynonym",
  "SearchSettings",
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

export async function ensurePlatformTables() {
  if (ensured) {
    return;
  }

  if (!supportsRawSql()) {
    ensured = true;
    return;
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [...REQUIRED_PLATFORM_TABLES],
  )) as Array<{ tableName: string }>;

  const present = new Set(rows.map((row) => row.tableName));
  const missing = REQUIRED_PLATFORM_TABLES.filter((tableName) => !present.has(tableName));
  if (missing.length > 0) {
    logger.error("Platform schema is missing required tables", { missing });
    throw new ConfigurationError(
      "Platform schema is missing required tables. Run the latest database migrations.",
      { missingTables: missing },
    );
  }

  ensured = true;
}

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function listPersistentServiceKeysFromDb() {
  return listPersistentServiceKeysFromDbForTenant();
}

export async function listPersistentServiceKeysFromDbForTenant(tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const rows = (await db.$queryRawUnsafe(`
    SELECT
      id,
      name,
      scopes,
      tenant_id AS "tenantId",
      created_at AS "createdAt",
      deprecated_at AS "deprecatedAt",
      revoked_at AS "revokedAt",
      last_used_at AS "lastUsedAt",
      key_prefix AS "keyPrefix",
      key_hash AS "keyHash",
      usage_count AS "usageCount"
    FROM "ServiceKey"
    WHERE ($1::text IS NULL OR tenant_id IS NULL OR tenant_id = $1)
    ORDER BY created_at DESC
  `, tenantId ?? null)) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    scopes: parseJson<string[]>(row.scopes, []),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    createdAt: new Date(String(row.createdAt)),
    deprecatedAt: row.deprecatedAt ? new Date(String(row.deprecatedAt)) : null,
    revokedAt: row.revokedAt ? new Date(String(row.revokedAt)) : null,
    lastUsedAt: row.lastUsedAt ? new Date(String(row.lastUsedAt)) : null,
    keyPrefix: String(row.keyPrefix),
    keyHash: String(row.keyHash),
    usageCount: Number(row.usageCount ?? 0),
  })) satisfies PersistedServiceKeyRow[];
}

export async function createPersistentServiceKeyInDb(input: {
  id: string;
  name: string;
  scopes: string[];
  tenantId?: string;
  deprecatedAt?: string;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    const key = `jam_sk_${randomBytes(24).toString("hex")}`;
    return {
      rawKey: key,
      keyPrefix: key.slice(0, 12),
    };
  }
  const key = `jam_sk_${randomBytes(24).toString("hex")}`;
  const keyHash = hashKey(key);
  const keyPrefix = key.slice(0, 12);

  await db.$executeRawUnsafe(
    `
      INSERT INTO "ServiceKey" (id, name, scopes, tenant_id, deprecated_at, key_prefix, key_hash)
      VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $6, $7)
    `,
    input.id,
    input.name,
    JSON.stringify(input.scopes),
    input.tenantId ?? null,
    input.deprecatedAt ?? null,
    keyPrefix,
    keyHash,
  );

  return {
    rawKey: key,
    keyPrefix,
  };
}

export async function rotatePersistentServiceKeyInDb(input: {
  id: string;
  tenantId?: string | null;
  deprecatedAt?: string;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    const key = `jam_sk_${randomBytes(24).toString("hex")}`;
    return {
      rawKey: key,
      keyPrefix: key.slice(0, 12),
    };
  }
  const key = `jam_sk_${randomBytes(24).toString("hex")}`;
  const keyHash = hashKey(key);
  const keyPrefix = key.slice(0, 12);

  const updated = await db.$executeRawUnsafe(
    `
      UPDATE "ServiceKey"
      SET
        key_hash = $2,
        key_prefix = $3,
        deprecated_at = COALESCE($4::timestamptz, deprecated_at),
        updated_at = NOW()
      WHERE id = $1 AND revoked_at IS NULL
        AND ($5::text IS NULL OR tenant_id IS NULL OR tenant_id = $5)
    `,
    input.id,
    keyHash,
    keyPrefix,
    input.deprecatedAt ?? null,
    input.tenantId ?? null,
  );

  return updated > 0
    ? {
        rawKey: key,
        keyPrefix,
      }
    : null;
}

export async function revokePersistentServiceKeyInDb(id: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return true;
  }
  const updated = await db.$executeRawUnsafe(
    `
      UPDATE "ServiceKey"
      SET revoked_at = NOW()
      WHERE id = $1 AND revoked_at IS NULL
        AND ($2::text IS NULL OR tenant_id IS NULL OR tenant_id = $2)
    `,
    id,
    tenantId ?? null,
  );

  return updated > 0;
}

export async function findPersistentServiceKeyByRawKeyInDb(key: string) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return null;
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        name,
        scopes,
        tenant_id AS "tenantId",
        created_at AS "createdAt",
        deprecated_at AS "deprecatedAt",
        revoked_at AS "revokedAt",
        last_used_at AS "lastUsedAt",
        key_prefix AS "keyPrefix",
        key_hash AS "keyHash",
        usage_count AS "usageCount"
      FROM "ServiceKey"
      WHERE key_hash = $1 AND revoked_at IS NULL
      LIMIT 1
    `,
    hashKey(key),
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "ServiceKey"
      SET last_used_at = NOW(), usage_count = usage_count + 1
      WHERE id = $1
    `,
    String(row.id),
  );

  return {
    id: String(row.id),
    name: String(row.name),
    scopes: parseJson<string[]>(row.scopes, []),
    tenantId: row.tenantId ? String(row.tenantId) : undefined,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    deprecatedAt: row.deprecatedAt ? new Date(String(row.deprecatedAt)).toISOString() : undefined,
    revokedAt: row.revokedAt ? new Date(String(row.revokedAt)).toISOString() : undefined,
  };
}

export async function listJobsFromDb(limit = 100) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        type,
        payload,
        status,
        attempts,
        run_at AS "runAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        last_error AS "lastError",
        locked_at AS "lockedAt",
        lock_token AS "lockToken"
      FROM "PlatformJob"
      ORDER BY created_at DESC
      LIMIT $1
    `,
    limit,
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    payload: parseJson<JsonRecord>(row.payload, {}),
    status: String(row.status),
    attempts: Number(row.attempts ?? 0),
    runAt: new Date(String(row.runAt)),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    lastError: row.lastError ? String(row.lastError) : null,
    lockedAt: row.lockedAt ? new Date(String(row.lockedAt)) : null,
    lockToken: row.lockToken ? String(row.lockToken) : null,
  })) satisfies PersistedJobRow[];
}

function jobTenantPredicate(alias = "") {
  const prefix = alias ? `${alias}.` : "";
  return `
    (
      $2::text IS NULL
      OR ${prefix}payload->'event'->>'tenantId' IS NULL
      OR ${prefix}payload->'event'->>'tenantId' = $2
      OR ${prefix}payload->>'tenantId' = $2
    )
  `;
}

export async function getJobByIdFromDb(jobId: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    const rows = await listJobsFromDb(500);
    return rows.find((row) => row.id === jobId) ?? null;
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        type,
        payload,
        status,
        attempts,
        run_at AS "runAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        last_error AS "lastError",
        locked_at AS "lockedAt",
        lock_token AS "lockToken"
      FROM "PlatformJob"
      WHERE id = $1
        AND ${jobTenantPredicate()}
      LIMIT 1
    `,
    jobId,
    tenantId ?? null,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    type: String(row.type),
    payload: parseJson<JsonRecord>(row.payload, {}),
    status: String(row.status),
    attempts: Number(row.attempts ?? 0),
    runAt: new Date(String(row.runAt)),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    lastError: row.lastError ? String(row.lastError) : null,
    lockedAt: row.lockedAt ? new Date(String(row.lockedAt)) : null,
    lockToken: row.lockToken ? String(row.lockToken) : null,
  } satisfies PersistedJobRow;
}

export async function getJobByIdFromDbLegacy(jobId: string) {
  const rows = await listJobsFromDb(500);
  return rows.find((row) => row.id === jobId) ?? null;
}

export async function enqueueJobInDb(input: {
  id: string;
  type: string;
  payload: JsonRecord;
  runAt: Date;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "PlatformJob" (id, type, payload, status, attempts, run_at)
      VALUES ($1, $2, $3::jsonb, 'pending', 0, $4::timestamptz)
    `,
    input.id,
    input.type,
    JSON.stringify(input.payload),
    input.runAt.toISOString(),
  );
}

export async function claimDueJobsFromDb(limit: number) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const lockToken = randomBytes(16).toString("hex");
  await db.$executeRawUnsafe(
    `
      UPDATE "PlatformJob"
      SET
        status = 'running',
        locked_at = NOW(),
        lock_token = $1,
        updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM "PlatformJob"
        WHERE status = 'pending' AND run_at <= NOW()
        ORDER BY run_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
    `,
    lockToken,
    limit,
  );

  const rows = await db.$queryRawUnsafe(
    `
      SELECT
        id,
        type,
        payload,
        status,
        attempts,
        run_at AS "runAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        last_error AS "lastError",
        locked_at AS "lockedAt",
        lock_token AS "lockToken"
      FROM "PlatformJob"
      WHERE lock_token = $1
      ORDER BY run_at ASC
    `,
    lockToken,
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    type: String(row.type),
    payload: parseJson<JsonRecord>(row.payload, {}),
    status: String(row.status),
    attempts: Number(row.attempts ?? 0),
    runAt: new Date(String(row.runAt)),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    lastError: row.lastError ? String(row.lastError) : null,
    lockedAt: row.lockedAt ? new Date(String(row.lockedAt)) : null,
    lockToken,
  })) satisfies PersistedJobRow[];
}

export async function completeJobInDb(jobId: string) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(`DELETE FROM "PlatformJob" WHERE id = $1`, jobId);
}

export async function retryJobInDb(jobId: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "PlatformJob"
      SET status = 'pending', run_at = NOW(), updated_at = NOW(), locked_at = NULL, lock_token = NULL
      WHERE id = $1
        AND ${jobTenantPredicate()}
    `,
    jobId,
    tenantId ?? null,
  );
}

export async function deleteJobInDb(jobId: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `DELETE FROM "PlatformJob" WHERE id = $1 AND ${jobTenantPredicate()}`,
    jobId,
    tenantId ?? null,
  );
}

export async function failJobInDb(input: {
  jobId: string;
  attempts: number;
  lastError: string;
  retryAt?: Date;
  dead: boolean;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "PlatformJob"
      SET
        attempts = $2,
        last_error = $3,
        status = $4,
        run_at = COALESCE($5::timestamptz, run_at),
        updated_at = NOW(),
        locked_at = NULL,
        lock_token = NULL
      WHERE id = $1
    `,
    input.jobId,
    input.attempts,
    input.lastError,
    input.dead ? "dead" : "pending",
    input.retryAt?.toISOString() ?? null,
  );
}

export async function getIdempotencyRecordFromDb(key: string) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return null;
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        idempotency_key AS "idempotencyKey",
        request_hash AS "requestHash",
        status,
        response_status AS "responseStatus",
        response_kind AS "responseKind",
        response_body AS "responseBody",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        expires_at AS "expiresAt"
      FROM "IdempotencyRecord"
      WHERE idempotency_key = $1 AND expires_at > NOW()
      LIMIT 1
    `,
    key,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    idempotencyKey: String(row.idempotencyKey),
    requestHash: String(row.requestHash),
    status: String(row.status),
    responseStatus: row.responseStatus == null ? null : Number(row.responseStatus),
    responseKind: row.responseKind ? String(row.responseKind) : null,
    responseBody: parseJson<unknown>(row.responseBody, row.responseBody),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    expiresAt: new Date(String(row.expiresAt)),
  } satisfies PersistedIdempotencyRow;
}

export async function claimIdempotencyRecordInDb(input: {
  key: string;
  requestHash: string;
  expiresAt: Date;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return { state: "claimed" } as const;
  }

  const claimedRows = (await db.$queryRawUnsafe(
    `
      INSERT INTO "IdempotencyRecord" (
        idempotency_key, request_hash, status, response_status, response_kind, response_body, expires_at
      )
      VALUES ($1, $2, 'in_progress', NULL, NULL, NULL, $3::timestamptz)
      ON CONFLICT (idempotency_key)
      DO UPDATE SET
        request_hash = EXCLUDED.request_hash,
        status = 'in_progress',
        response_status = NULL,
        response_kind = NULL,
        response_body = NULL,
        updated_at = NOW(),
        expires_at = EXCLUDED.expires_at
      WHERE "IdempotencyRecord".expires_at <= NOW()
      RETURNING idempotency_key
    `,
    input.key,
    input.requestHash,
    input.expiresAt.toISOString(),
  )) as Array<{ idempotency_key: string }>;

  if (claimedRows.length > 0) {
    return { state: "claimed" } as const;
  }

  const record = await getIdempotencyRecordFromDb(input.key);
  if (!record) {
    return { state: "claimed" } as const;
  }

  if (record.requestHash !== input.requestHash) {
    return { state: "hash_mismatch", record } as const;
  }

  if (record.status === "in_progress") {
    return { state: "in_progress", record } as const;
  }

  return { state: "replay", record } as const;
}

export async function upsertIdempotencyRecordInDb(input: {
  key: string;
  requestHash: string;
  status: string;
  responseStatus?: number | null;
  responseKind?: string | null;
  responseBody?: unknown;
  expiresAt: Date;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "IdempotencyRecord" (
        idempotency_key, request_hash, status, response_status, response_kind, response_body, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
      ON CONFLICT (idempotency_key)
      DO UPDATE SET
        request_hash = EXCLUDED.request_hash,
        status = EXCLUDED.status,
        response_status = EXCLUDED.response_status,
        response_kind = EXCLUDED.response_kind,
        response_body = EXCLUDED.response_body,
        updated_at = NOW(),
        expires_at = EXCLUDED.expires_at
    `,
    input.key,
    input.requestHash,
    input.status,
    input.responseStatus ?? null,
    input.responseKind ?? null,
    input.responseBody === undefined ? null : JSON.stringify(input.responseBody),
    input.expiresAt.toISOString(),
  );
}

export async function completeIdempotencyRecordInDb(input: {
  key: string;
  requestHash: string;
  responseStatus?: number | null;
  responseKind?: string | null;
  responseBody?: unknown;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "IdempotencyRecord"
      SET
        status = 'completed',
        response_status = $3,
        response_kind = $4,
        response_body = $5::jsonb,
        updated_at = NOW()
      WHERE idempotency_key = $1
        AND request_hash = $2
        AND status = 'in_progress'
    `,
    input.key,
    input.requestHash,
    input.responseStatus ?? null,
    input.responseKind ?? null,
    input.responseBody === undefined ? null : JSON.stringify(input.responseBody),
  );
}

export async function deleteIdempotencyRecordInDb(key: string) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `DELETE FROM "IdempotencyRecord" WHERE idempotency_key = $1`,
    key,
  );
}

export async function persistDomainEventInDb(event: {
  eventId: string;
  type: string;
  tenantId?: string;
  payload: JsonRecord;
  occurredAt: string;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "DomainEvent" (event_id, type, tenant_id, payload, occurred_at)
      VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
      ON CONFLICT (event_id) DO NOTHING
    `,
    event.eventId,
    event.type,
    event.tenantId ?? null,
    JSON.stringify(event.payload),
    event.occurredAt,
  );
}

export async function listDomainEventsFromDb(input?: {
  limit?: number;
  after?: string;
  tenantId?: string | null;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        event_id AS "eventId",
        type,
        tenant_id AS "tenantId",
        payload,
        occurred_at AS "occurredAt"
      FROM "DomainEvent"
      WHERE ($1::timestamptz IS NULL OR occurred_at > $1::timestamptz)
        AND ($2::text IS NULL OR tenant_id IS NULL OR tenant_id = $2)
      ORDER BY occurred_at DESC
      LIMIT $3
    `,
    input?.after ?? null,
    input?.tenantId ?? null,
    limit,
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    eventId: String(row.eventId),
    type: String(row.type),
    tenantId: row.tenantId ? String(row.tenantId) : undefined,
    payload: parseJson<JsonRecord>(row.payload, {}),
    occurredAt: new Date(String(row.occurredAt)).toISOString(),
  })) satisfies Array<{
    eventId: string;
    type: string;
    tenantId?: string;
    payload: JsonRecord;
    occurredAt: string;
  }>;
}

export async function listWebhookSubscriptionsFromDb() {
  return listWebhookSubscriptionsFromDbForTenant();
}

export async function listWebhookSubscriptionsFromDbForTenant(tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        endpoint,
        events,
        secret,
        headers,
        tenant_id AS "tenantId",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        last_delivery_at AS "lastDeliveryAt",
        failure_count AS "failureCount"
      FROM "WebhookSubscription"
      WHERE ($1::text IS NULL OR tenant_id IS NULL OR tenant_id = $1)
      ORDER BY created_at DESC
    `,
    tenantId ?? null,
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    endpoint: String(row.endpoint),
    events: parseJson<string[]>(row.events, []),
    secret: row.secret ? String(row.secret) : null,
    headers: parseJson<JsonRecord | null>(row.headers, null),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    status: String(row.status),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
    lastDeliveryAt: row.lastDeliveryAt ? new Date(String(row.lastDeliveryAt)) : null,
    failureCount: Number(row.failureCount ?? 0),
  })) satisfies PersistedWebhookSubscriptionRow[];
}

export async function createWebhookSubscriptionInDb(input: {
  id: string;
  endpoint: string;
  events: string[];
  secret?: string;
  headers?: JsonRecord;
  tenantId?: string;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "WebhookSubscription" (id, endpoint, events, secret, headers, tenant_id, status)
      VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, 'active')
    `,
    input.id,
    input.endpoint,
    JSON.stringify(input.events),
    input.secret ?? null,
    input.headers ? JSON.stringify(input.headers) : null,
    input.tenantId ?? null,
  );
}

export async function updateWebhookSubscriptionInDb(input: {
  id: string;
  endpoint?: string;
  events?: string[];
  secret?: string | null;
  headers?: JsonRecord | null;
  status?: "active" | "paused";
  tenantId?: string | null;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "WebhookSubscription"
      SET
        endpoint = COALESCE($2, endpoint),
        events = COALESCE($3::jsonb, events),
        secret = COALESCE($4, secret),
        headers = COALESCE($5::jsonb, headers),
        status = COALESCE($6, status),
        updated_at = NOW()
      WHERE id = $1
        AND ($7::text IS NULL OR tenant_id IS NULL OR tenant_id = $7)
    `,
    input.id,
    input.endpoint ?? null,
    input.events ? JSON.stringify(input.events) : null,
    input.secret ?? null,
    input.headers ? JSON.stringify(input.headers) : null,
    input.status ?? null,
    input.tenantId ?? null,
  );
}

export async function deleteWebhookSubscriptionInDb(id: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      DELETE FROM "WebhookSubscription"
      WHERE id = $1
        AND ($2::text IS NULL OR tenant_id IS NULL OR tenant_id = $2)
    `,
    id,
    tenantId ?? null,
  );
}

export async function markWebhookSubscriptionDelivery(input: {
  id: string;
  ok: boolean;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "WebhookSubscription"
      SET
        last_delivery_at = NOW(),
        failure_count = CASE WHEN $2 THEN 0 ELSE failure_count + 1 END,
        updated_at = NOW()
      WHERE id = $1
    `,
    input.id,
    input.ok,
  );
}

export async function loadActiveWebhookDestinations(eventType: string) {
  const rows = await listWebhookSubscriptionsFromDb();
  return rows.filter(
    (row) =>
      row.status === "active" &&
      (row.events.includes(eventType) || row.events.includes("*")),
  );
}

export async function cleanupExpiredIdempotencyRecords() {
  try {
    await ensurePlatformTables();
    await db.$executeRawUnsafe(
      `DELETE FROM "IdempotencyRecord" WHERE expires_at <= NOW()`,
    );
  } catch (error) {
    logger.warn("Failed to clean up idempotency records", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getEventCheckpointFromDb(consumerId: string) {
  return getEventCheckpointFromDbForTenant(consumerId);
}

export async function getEventCheckpointFromDbForTenant(
  consumerId: string,
  tenantId?: string | null,
) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return null;
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        consumer_id AS "consumerId",
        last_event_id AS "lastEventId",
        last_occurred_at AS "lastOccurredAt",
        updated_at AS "updatedAt"
      FROM "EventCheckpoint"
      WHERE consumer_id = $1
        AND ($2::text IS NULL OR tenant_id IS NULL OR tenant_id = $2)
      LIMIT 1
    `,
    consumerId,
    tenantId ?? null,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    consumerId: String(row.consumerId),
    lastEventId: row.lastEventId ? String(row.lastEventId) : null,
    lastOccurredAt: row.lastOccurredAt ? new Date(String(row.lastOccurredAt)).toISOString() : null,
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  };
}

export async function upsertEventCheckpointInDb(input: {
  consumerId: string;
  lastEventId?: string | null;
  lastOccurredAt?: string | null;
  tenantId?: string | null;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      INSERT INTO "EventCheckpoint" (consumer_id, last_event_id, last_occurred_at, tenant_id)
      VALUES ($1, $2, $3::timestamptz, $4)
      ON CONFLICT (consumer_id)
      DO UPDATE SET
        last_event_id = EXCLUDED.last_event_id,
        last_occurred_at = EXCLUDED.last_occurred_at,
        tenant_id = EXCLUDED.tenant_id,
        updated_at = NOW()
    `,
    input.consumerId,
    input.lastEventId ?? null,
    input.lastOccurredAt ?? null,
    input.tenantId ?? null,
  );
}

export async function listRoleGrantsFromDb(input?: {
  subjectType?: string;
  subjectId?: string;
  tenantId?: string | null;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        subject_type AS "subjectType",
        subject_id AS "subjectId",
        role,
        tenant_id AS "tenantId",
        resource_type AS "resourceType",
        resource_id AS "resourceId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM "RoleGrant"
      WHERE ($1::text IS NULL OR subject_type = $1)
        AND ($2::text IS NULL OR subject_id = $2)
        AND ($3::text IS NULL OR tenant_id IS NULL OR tenant_id = $3)
      ORDER BY created_at DESC
    `,
    input?.subjectType ?? null,
    input?.subjectId ?? null,
    input?.tenantId ?? null,
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    subjectType: String(row.subjectType),
    subjectId: String(row.subjectId),
    role: String(row.role),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    resourceType: row.resourceType ? String(row.resourceType) : null,
    resourceId: row.resourceId ? String(row.resourceId) : null,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  }));
}

export async function createRoleGrantInDb(input: {
  id: string;
  subjectType: string;
  subjectId: string;
  role: string;
  tenantId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "RoleGrant"
      (id, subject_type, subject_id, role, tenant_id, resource_type, resource_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    input.id,
    input.subjectType,
    input.subjectId,
    input.role,
    input.tenantId ?? null,
    input.resourceType ?? null,
    input.resourceId ?? null,
  );
}

export async function deleteRoleGrantInDb(id: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      DELETE FROM "RoleGrant"
      WHERE id = $1
        AND ($2::text IS NULL OR tenant_id IS NULL OR tenant_id = $2)
    `,
    id,
    tenantId ?? null,
  );
}

export async function listSearchSynonymsFromDb(tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return [];
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        term,
        synonym,
        group_key AS "groupKey",
        notes,
        enabled,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM "SearchSynonym"
      WHERE ($1::text IS NULL OR tenant_id IS NULL OR tenant_id = $1)
      ORDER BY created_at DESC
    `,
    tenantId ?? null,
  )) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    tenantId: row.tenantId ? String(row.tenantId) : null,
    term: String(row.term),
    synonym: String(row.synonym),
    groupKey: row.groupKey ? String(row.groupKey) : null,
    notes: row.notes ? String(row.notes) : null,
    enabled: Boolean(row.enabled ?? true),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  }));
}

export async function createSearchSynonymInDb(input: {
  id: string;
  tenantId?: string | null;
  term: string;
  synonym: string;
  groupKey?: string | null;
  notes?: string | null;
  enabled?: boolean;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "SearchSynonym" (id, tenant_id, term, synonym, group_key, notes, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    input.id,
    input.tenantId ?? null,
    input.term,
    input.synonym,
    input.groupKey ?? null,
    input.notes ?? null,
    input.enabled ?? true,
  );
}

export async function deleteSearchSynonymInDb(id: string, tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `DELETE FROM "SearchSynonym" WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2`,
    id,
    tenantId ?? null,
  );
}

export async function updateSearchSynonymGroupInDb(input: {
  groupKey: string;
  tenantId?: string | null;
  enabled?: boolean;
  notes?: string | null;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "SearchSynonym"
      SET
        enabled = COALESCE($3, enabled),
        notes = COALESCE($4, notes),
        updated_at = NOW()
      WHERE tenant_id IS NOT DISTINCT FROM $1 AND group_key = $2
    `,
    input.tenantId ?? null,
    input.groupKey,
    input.enabled ?? null,
    input.notes ?? null,
  );
}

export async function getSearchSettingsFromDb(tenantId?: string | null) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return null;
  }
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        tenant_id AS "tenantId",
        exact_match_boost AS "exactMatchBoost",
        prefix_match_boost AS "prefixMatchBoost",
        substring_match_boost AS "substringMatchBoost",
        fuzzy_threshold AS "fuzzyThreshold",
        game_weight AS "gameWeight",
        track_weight AS "trackWeight",
        post_weight AS "postWeight",
        user_weight AS "userWeight",
        team_weight AS "teamWeight",
        freshness_half_life_hours AS "freshnessHalfLifeHours",
        updated_at AS "updatedAt"
      FROM "SearchSettings"
      WHERE tenant_id = $1
      LIMIT 1
    `,
    tenantId ?? "default",
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    tenantId: row.tenantId ? String(row.tenantId) : null,
    exactMatchBoost: Number(row.exactMatchBoost ?? 3),
    prefixMatchBoost: Number(row.prefixMatchBoost ?? 2),
    substringMatchBoost: Number(row.substringMatchBoost ?? 1),
    fuzzyThreshold: Number(row.fuzzyThreshold ?? 0.1),
    gameWeight: Number(row.gameWeight ?? 1.2),
    trackWeight: Number(row.trackWeight ?? 1),
    postWeight: Number(row.postWeight ?? 1),
    userWeight: Number(row.userWeight ?? 1),
    teamWeight: Number(row.teamWeight ?? 0.9),
    freshnessHalfLifeHours: Number(row.freshnessHalfLifeHours ?? 168),
    updatedAt: new Date(String(row.updatedAt)),
  } satisfies PersistedSearchSettingsRow;
}

export async function upsertSearchSettingsInDb(input: {
  tenantId?: string | null;
  exactMatchBoost?: number;
  prefixMatchBoost?: number;
  substringMatchBoost?: number;
  fuzzyThreshold?: number;
  gameWeight?: number;
  trackWeight?: number;
  postWeight?: number;
  userWeight?: number;
  teamWeight?: number;
  freshnessHalfLifeHours?: number;
}) {
  await ensurePlatformTables();
  if (!supportsRawSql()) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      INSERT INTO "SearchSettings" (
        tenant_id,
        exact_match_boost,
        prefix_match_boost,
        substring_match_boost,
        fuzzy_threshold,
        game_weight,
        track_weight,
        post_weight,
        user_weight,
        team_weight,
        freshness_half_life_hours
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        exact_match_boost = EXCLUDED.exact_match_boost,
        prefix_match_boost = EXCLUDED.prefix_match_boost,
        substring_match_boost = EXCLUDED.substring_match_boost,
        fuzzy_threshold = EXCLUDED.fuzzy_threshold,
        game_weight = EXCLUDED.game_weight,
        track_weight = EXCLUDED.track_weight,
        post_weight = EXCLUDED.post_weight,
        user_weight = EXCLUDED.user_weight,
        team_weight = EXCLUDED.team_weight,
        freshness_half_life_hours = EXCLUDED.freshness_half_life_hours,
        updated_at = NOW()
    `,
    input.tenantId ?? "default",
    input.exactMatchBoost ?? 3,
    input.prefixMatchBoost ?? 2,
    input.substringMatchBoost ?? 1,
    input.fuzzyThreshold ?? 0.1,
    input.gameWeight ?? 1.2,
    input.trackWeight ?? 1,
    input.postWeight ?? 1,
    input.userWeight ?? 1,
    input.teamWeight ?? 0.9,
    input.freshnessHalfLifeHours ?? 168,
  );
}
