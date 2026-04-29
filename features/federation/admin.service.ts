import { randomUUID } from "node:crypto";
import { z } from "zod";

import db from "../../infra/db.js";

export const federationBlockSchema = z.object({
  blockType: z.enum(["domain", "actor"]),
  value: z.string().trim().min(1),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const federationTrustSettingsSchema = z.object({
  mode: z.enum(["open", "allowlist", "moderated"]),
});

export const federationAllowlistSchema = z.object({
  allowType: z.enum(["domain", "actor"]),
  value: z.string().trim().min(1),
});

export const federationReputationSchema = z.object({
  host: z.string().trim().min(1),
  trustLevel: z.enum(["trusted", "unknown", "limited", "blocked"]),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const federationPreviewDecisionSchema = z.object({
  id: z.string().trim().min(1),
  decision: z.enum(["approve", "reject"]),
});

export const deleteFederationBlockSchema = z.object({
  id: z.string().trim().min(1),
});

function normalizeBlockValue(blockType: "domain" | "actor", value: string) {
  if (blockType === "domain") {
    const candidate = value.includes("://") ? new URL(value).hostname : value;
    return candidate.toLowerCase().replace(/^\.+|\.+$/g, "");
  }
  return value.trim();
}

function normalizeTrustValue(kind: "domain" | "actor", value: string) {
  return normalizeBlockValue(kind, value);
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeHost(value: string) {
  const host = hostFromUrl(value) ?? value;
  return host.toLowerCase().replace(/^\.+|\.+$/g, "");
}

function supportsRawSql() {
  return typeof (db as { $queryRawUnsafe?: unknown }).$queryRawUnsafe === "function";
}

function supportsRawExecute() {
  return typeof (db as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function";
}

function isMissingFederationBlocksTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("FederationBlock") || message.includes("42P01");
}

function isMissingFederationTrustTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("FederationTrustSetting") ||
    message.includes("FederationAllowlistEntry") ||
    message.includes("42P01")
  );
}

export async function listFederationBlocks(tenantId?: string | null) {
  if (!supportsRawSql()) {
    return [];
  }
  return db.$queryRawUnsafe(
    `
      SELECT
        id,
        tenant_id AS "tenantId",
        block_type AS "blockType",
        value,
        reason,
        created_by AS "createdBy",
        created_at AS "createdAt"
      FROM "FederationBlock"
      WHERE tenant_id IS NOT DISTINCT FROM $1
      ORDER BY created_at DESC
    `,
    tenantId ?? null,
  );
}

export async function getFederationTrustSettings(tenantId?: string | null) {
  if (!supportsRawSql()) {
    return { tenantId: tenantId ?? "default", mode: "open" as const, updatedAt: null };
  }
  let rows: Array<{ tenantId: string; mode: "open" | "allowlist" | "moderated"; updatedAt: Date }>;
  try {
    rows = (await db.$queryRawUnsafe(
      `
        SELECT tenant_id AS "tenantId", mode, updated_at AS "updatedAt"
        FROM "FederationTrustSetting"
        WHERE tenant_id = $1
        LIMIT 1
      `,
      tenantId ?? "default",
    )) as Array<{ tenantId: string; mode: "open" | "allowlist" | "moderated"; updatedAt: Date }>;
  } catch (error) {
    if (isMissingFederationTrustTable(error)) {
      return { tenantId: tenantId ?? "default", mode: "open" as const, updatedAt: null };
    }
    throw error;
  }
  return rows[0] ?? {
    tenantId: tenantId ?? "default",
    mode: "open" as const,
    updatedAt: null,
  };
}

export async function updateFederationTrustSettings({
  input,
  tenantId,
}: {
  input: z.infer<typeof federationTrustSettingsSchema>;
  tenantId?: string | null;
}) {
  const normalizedTenantId = tenantId ?? "default";
  await db.$executeRawUnsafe(
    `
      INSERT INTO "FederationTrustSetting" (tenant_id, mode)
      VALUES ($1, $2)
      ON CONFLICT (tenant_id)
      DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW()
    `,
    normalizedTenantId,
    input.mode,
  );
  return getFederationTrustSettings(normalizedTenantId);
}

export async function listFederationAllowlist(tenantId?: string | null) {
  if (!supportsRawSql()) return [];
  try {
    return await db.$queryRawUnsafe(
      `
        SELECT
          id,
          tenant_id AS "tenantId",
          allow_type AS "allowType",
          value,
          created_by AS "createdBy",
          created_at AS "createdAt"
        FROM "FederationAllowlistEntry"
        WHERE tenant_id IS NOT DISTINCT FROM $1
        ORDER BY created_at DESC
      `,
      tenantId ?? null,
    );
  } catch (error) {
    if (isMissingFederationTrustTable(error)) return [];
    throw error;
  }
}

export async function createFederationAllowlistEntry({
  input,
  tenantId,
  actorId,
}: {
  input: z.infer<typeof federationAllowlistSchema>;
  tenantId?: string | null;
  actorId?: number | null;
}) {
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `
      INSERT INTO "FederationAllowlistEntry"
      (id, tenant_id, allow_type, value, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, allow_type, value) DO NOTHING
    `,
    id,
    tenantId ?? null,
    input.allowType,
    normalizeTrustValue(input.allowType, input.value),
    actorId ?? null,
  );
  return listFederationAllowlist(tenantId);
}

export async function deleteFederationAllowlistEntry(id: string, tenantId?: string | null) {
  await db.$executeRawUnsafe(
    `DELETE FROM "FederationAllowlistEntry" WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2`,
    id,
    tenantId ?? null,
  );
  return { ok: true };
}

export async function createFederationBlock({
  input,
  tenantId,
  actorId,
}: {
  input: z.infer<typeof federationBlockSchema>;
  tenantId?: string | null;
  actorId?: number | null;
}) {
  if (!supportsRawSql()) {
    return [];
  }
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `
      INSERT INTO "FederationBlock"
      (id, tenant_id, block_type, value, reason, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, block_type, value)
      DO UPDATE SET reason = EXCLUDED.reason
    `,
    id,
    tenantId ?? null,
    input.blockType,
    normalizeBlockValue(input.blockType, input.value),
    input.reason ?? null,
    actorId ?? null,
  );
  return listFederationBlocks(tenantId);
}

export async function deleteFederationBlock(id: string, tenantId?: string | null) {
  if (!supportsRawSql()) {
    return { ok: true };
  }
  await db.$executeRawUnsafe(
    `DELETE FROM "FederationBlock" WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2`,
    id,
    tenantId ?? null,
  );
  return { ok: true };
}

export async function isFederationActorBlocked(actorId: string, tenantId?: string | null) {
  if (!supportsRawSql()) {
    return false;
  }
  const host = hostFromUrl(actorId);
  try {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "FederationBlock"
        WHERE tenant_id IS NOT DISTINCT FROM $1
          AND (
            (block_type = 'actor' AND value = $2)
            OR (block_type = 'domain' AND value = $3)
          )
        LIMIT 1
      `,
      tenantId ?? null,
      actorId,
      host,
    )) as Array<{ id: string }>;
    return rows.length > 0;
  } catch (error) {
    if (isMissingFederationBlocksTable(error)) {
      return false;
    }
    throw error;
  }
}

export async function isFederationActorAllowed(actorId: string, tenantId?: string | null) {
  if (!supportsRawSql()) {
    return true;
  }
  const settings = await getFederationTrustSettings(tenantId);
  if (settings.mode === "open") {
    return true;
  }
  if (settings.mode === "moderated") {
    return !(await isFederationActorBlocked(actorId, tenantId));
  }
  const host = hostFromUrl(actorId);
  try {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "FederationAllowlistEntry"
        WHERE tenant_id IS NOT DISTINCT FROM $1
          AND (
            (allow_type = 'actor' AND value = $2)
            OR (allow_type = 'domain' AND value = $3)
          )
        LIMIT 1
      `,
      tenantId ?? null,
      actorId,
      host,
    )) as Array<{ id: string }>;
    return rows.length > 0;
  } catch (error) {
    if (isMissingFederationTrustTable(error)) return true;
    throw error;
  }
}

export async function isFederationActorPreviewRequired(actorId: string, tenantId?: string | null) {
  const settings = await getFederationTrustSettings(tenantId);
  if (settings.mode !== "moderated") return false;
  const host = hostFromUrl(actorId);
  if (!host) return true;
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM "FederationAllowlistEntry"
      WHERE tenant_id IS NOT DISTINCT FROM $1
        AND (
          (allow_type = 'actor' AND value = $2)
          OR (allow_type = 'domain' AND value = $3)
        )
      LIMIT 1
    `,
    tenantId ?? null,
    actorId,
    host,
  ).catch(() => [])) as Array<{ id: string }>;
  return rows.length === 0;
}

export async function queueFederationPreview({
  actorId,
  activity,
  tenantId,
}: {
  actorId: string;
  activity: { id?: string; type?: string; object?: unknown };
  tenantId?: string | null;
}) {
  if (!supportsRawExecute()) {
    return {
      accepted: true as const,
      statusCode: 202,
      summary: "Activity queued for moderation preview",
      activity: { previewId: null },
      deliveryId: null,
    };
  }
  const id = randomUUID();
  const objectValue = activity.object as { type?: string; content?: string; name?: string } | string | undefined;
  const objectType = typeof objectValue === "object" ? objectValue?.type ?? null : null;
  const summary =
    typeof objectValue === "object"
      ? objectValue?.name ?? objectValue?.content?.slice(0, 240) ?? null
      : typeof objectValue === "string"
        ? objectValue
        : null;
  await db.$executeRawUnsafe(
    `
      INSERT INTO "FederationPreviewQueueItem"
      (id, tenant_id, actor_id, activity_id, activity_type, object_type, summary, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    id,
    tenantId ?? null,
    actorId,
    activity.id ?? null,
    activity.type ?? null,
    objectType,
    summary,
    JSON.stringify(activity),
  );
  await incrementFederationReputation({ actorId, tenantId, field: "rejected_activities" });
  return {
    accepted: true as const,
    statusCode: 202,
    summary: "Activity queued for moderation preview",
    activity: { previewId: id },
    deliveryId: null,
  };
}

export async function listFederationPreviewQueue(tenantId?: string | null) {
  return db.$queryRawUnsafe(
    `
      SELECT id, actor_id AS "actorId", activity_id AS "activityId",
        activity_type AS "activityType", object_type AS "objectType",
        summary, status, reviewed_by AS "reviewedBy",
        reviewed_at AS "reviewedAt", created_at AS "createdAt"
      FROM "FederationPreviewQueueItem"
      WHERE tenant_id IS NOT DISTINCT FROM $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    tenantId ?? null,
  ).catch(() => []);
}

export async function updateFederationPreviewDecision({
  input,
  tenantId,
  actorId,
}: {
  input: z.infer<typeof federationPreviewDecisionSchema>;
  tenantId?: string | null;
  actorId?: number | null;
}) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT payload
      FROM "FederationPreviewQueueItem"
      WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2
      LIMIT 1
    `,
    input.id,
    tenantId ?? null,
  ).catch(() => [])) as Array<{ payload: unknown }>;
  await db.$executeRawUnsafe(
    `
      UPDATE "FederationPreviewQueueItem"
      SET status = $3, reviewed_by = $4, reviewed_at = NOW()
      WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2
    `,
    input.id,
    tenantId ?? null,
    input.decision === "approve" ? "approved" : "rejected",
    actorId ?? null,
  );
  return {
    ok: true,
    status: input.decision === "approve" ? "approved" : "rejected",
    replayed: false,
    replayRequired: input.decision === "approve",
    activity: input.decision === "approve" ? rows[0]?.payload ?? null : undefined,
  };
}

export async function listFederationReputation(tenantId?: string | null) {
  return db.$queryRawUnsafe(
    `
      SELECT id, tenant_id AS "tenantId", host, trust_level AS "trustLevel",
        deliveries_failed AS "deliveriesFailed",
        deliveries_succeeded AS "deliveriesSucceeded",
        rejected_activities AS "rejectedActivities",
        accepted_activities AS "acceptedActivities",
        report_count AS "reportCount",
        notes, updated_by AS "updatedBy", updated_at AS "updatedAt"
      FROM "FederationReputation"
      WHERE tenant_id IS NOT DISTINCT FROM $1
      ORDER BY updated_at DESC
      LIMIT 100
    `,
    tenantId ?? null,
  ).catch(() => []);
}

export async function updateFederationReputation({
  input,
  tenantId,
  actorId,
}: {
  input: z.infer<typeof federationReputationSchema>;
  tenantId?: string | null;
  actorId?: number | null;
}) {
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `
      INSERT INTO "FederationReputation"
      (id, tenant_id, host, trust_level, notes, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, host)
      DO UPDATE SET trust_level = EXCLUDED.trust_level,
        notes = EXCLUDED.notes,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `,
    id,
    tenantId ?? null,
    normalizeHost(input.host),
    input.trustLevel,
    input.notes ?? null,
    actorId ?? null,
  );
  return listFederationReputation(tenantId);
}

export async function incrementFederationReputation({
  actorId,
  tenantId,
  field,
}: {
  actorId: string;
  tenantId?: string | null;
  field: "accepted_activities" | "rejected_activities" | "deliveries_failed" | "deliveries_succeeded";
}) {
  if (!supportsRawExecute()) return;
  const host = normalizeHost(actorId);
  const id = randomUUID();
  await db.$executeRawUnsafe(
    `
      INSERT INTO "FederationReputation" (id, tenant_id, host, ${field})
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (tenant_id, host)
      DO UPDATE SET ${field} = "FederationReputation".${field} + 1,
        updated_at = NOW()
    `,
    id,
    tenantId ?? null,
    host,
  ).catch(() => undefined);
}

export async function isFederationInboxBlocked(inbox: string, tenantId?: string | null) {
  if (!supportsRawSql()) {
    return false;
  }
  const host = hostFromUrl(inbox);
  if (!host) return true;
  try {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "FederationBlock"
        WHERE tenant_id IS NOT DISTINCT FROM $1
          AND block_type = 'domain'
          AND value = $2
        LIMIT 1
      `,
      tenantId ?? null,
      host,
    )) as Array<{ id: string }>;
    return rows.length > 0;
  } catch (error) {
    if (isMissingFederationBlocksTable(error)) {
      return false;
    }
    throw error;
  }
}
