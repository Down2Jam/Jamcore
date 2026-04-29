import type { Prisma } from "@prisma/client";

import db from "./db.js";
import logger from "./logger.js";
import { ConfigurationError } from "../lib/errors.js";

type CoreEntityType = "User" | "Post" | "Team" | "Game" | "Jam";

const CORE_TABLES: Record<CoreEntityType, string> = {
  User: '"User"',
  Post: '"Post"',
  Team: '"Team"',
  Game: '"Game"',
  Jam: '"Jam"',
};

type RawDbClient = Pick<Prisma.TransactionClient, "$executeRawUnsafe" | "$queryRawUnsafe">;

let ensured = false;

function supportsRawSql(client: RawDbClient = db) {
  return (
    typeof (client as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function" &&
    typeof (client as { $queryRawUnsafe?: unknown }).$queryRawUnsafe === "function"
  );
}

export async function ensureCoreTenantColumns() {
  if (ensured || !supportsRawSql()) {
    ensured = true;
    return;
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT table_name AS "tableName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenant_id'
        AND table_name = ANY($1::text[])
    `,
    Object.keys(CORE_TABLES),
  )) as Array<{ tableName: string }>;

  const present = new Set(rows.map((row) => row.tableName));
  const missing = Object.keys(CORE_TABLES).filter((tableName) => !present.has(tableName));

  if (missing.length > 0) {
    logger.error("Core tenant schema is missing required columns", { missing });
    throw new ConfigurationError(
      "Core tenant schema is missing required columns. Run the latest database migrations.",
      { missingTables: missing },
    );
  }

  ensured = true;
}

export async function assignCoreEntityTenant(input: {
  entityType: CoreEntityType;
  entityId: number;
  tenantId: string;
}, client: RawDbClient = db) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql(client)) {
    return;
  }

  await client.$executeRawUnsafe(
    `UPDATE ${CORE_TABLES[input.entityType]} SET tenant_id = $2 WHERE id = $1`,
    input.entityId,
    input.tenantId,
  );
}

export async function doesCoreEntityBelongToTenant(input: {
  entityType: CoreEntityType;
  entityId: number;
  tenantId?: string | null;
  strictIsolation?: boolean;
}) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql() || !input.tenantId) {
    return true;
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM ${CORE_TABLES[input.entityType]}
      WHERE id = $1
        AND (
          ($2::boolean = true AND tenant_id = $3)
          OR ($2::boolean = false AND (tenant_id IS NULL OR tenant_id = $3))
        )
      LIMIT 1
    `,
    input.entityId,
    input.strictIsolation ?? false,
    input.tenantId,
  )) as Array<{ id: number }>;

  return rows.length > 0;
}

export async function filterCoreEntityIdsByTenant(input: {
  entityType: CoreEntityType;
  ids: number[];
  tenantId?: string | null;
  strictIsolation?: boolean;
}) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql() || !input.tenantId || input.ids.length === 0) {
    return input.ids;
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM ${CORE_TABLES[input.entityType]}
      WHERE id = ANY($1::int[])
        AND (
          ($2::boolean = true AND tenant_id = $3)
          OR ($2::boolean = false AND (tenant_id IS NULL OR tenant_id = $3))
        )
    `,
    input.ids,
    input.strictIsolation ?? false,
    input.tenantId,
  )) as Array<{ id: number }>;

  return rows.map((row) => row.id);
}

export async function getCoreEntityTenant(input: {
  entityType: CoreEntityType;
  entityId: number;
}) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql()) {
    return null;
  }

  const rows = (await db.$queryRawUnsafe(
    `SELECT tenant_id AS "tenantId" FROM ${CORE_TABLES[input.entityType]} WHERE id = $1 LIMIT 1`,
    input.entityId,
  )) as Array<{ tenantId: string | null }>;

  return rows[0]?.tenantId ?? null;
}

export async function listCoreEntitiesByTenant(input: {
  entityType: CoreEntityType;
  tenantId?: string | null;
  strictIsolation?: boolean;
  limit?: number;
}) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql()) {
    return [];
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM ${CORE_TABLES[input.entityType]}
      WHERE (
        $1::text IS NULL
        OR ($2::boolean = true AND tenant_id = $1)
        OR ($2::boolean = false AND (tenant_id IS NULL OR tenant_id = $1))
      )
      ORDER BY id DESC
      LIMIT $3
    `,
    input.tenantId ?? null,
    input.strictIsolation ?? false,
    input.limit ?? 1000,
  )) as Array<{ id: number }>;

  return rows.map((row) => row.id);
}

export async function listCoreEntitiesByTenantPage(input: {
  entityType: CoreEntityType;
  tenantId?: string | null;
  strictIsolation?: boolean;
  limit?: number;
  afterId?: number | null;
}) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql()) {
    return [];
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM ${CORE_TABLES[input.entityType]}
      WHERE (
        $1::text IS NULL
        OR ($2::boolean = true AND tenant_id = $1)
        OR ($2::boolean = false AND (tenant_id IS NULL OR tenant_id = $1))
      )
        AND ($3::int IS NULL OR id > $3)
      ORDER BY id ASC
      LIMIT $4
    `,
    input.tenantId ?? null,
    input.strictIsolation ?? false,
    input.afterId ?? null,
    input.limit ?? 100,
  )) as Array<{ id: number }>;

  return rows.map((row) => row.id);
}

export async function countCoreEntitiesByTenant(input: {
  entityType: CoreEntityType;
  tenantId?: string | null;
  strictIsolation?: boolean;
}) {
  await ensureCoreTenantColumns();
  if (!supportsRawSql()) {
    return 0;
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS count
      FROM ${CORE_TABLES[input.entityType]}
      WHERE (
        $1::text IS NULL
        OR ($2::boolean = true AND tenant_id = $1)
        OR ($2::boolean = false AND (tenant_id IS NULL OR tenant_id = $1))
      )
    `,
    input.tenantId ?? null,
    input.strictIsolation ?? false,
  )) as Array<{ count: number }>;

  return Number(rows[0]?.count ?? 0);
}
