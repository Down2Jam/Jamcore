import { randomUUID } from "node:crypto";

import { z } from "zod";

import db from "../../infra/db.js";
import { buildFederatedContent } from "./protocol/content.js";
import type { InboxActivity } from "./protocol/schemas.js";
import { resolveRemoteActorProfile } from "./models/remote-actor.service.js";
import { createFederationBlock } from "./admin.service.js";

type CreateActivity = Extract<InboxActivity, { type: "Create" }>;
type LocalReference = {
  kind: "post" | "comment" | "game" | "track";
  id?: number;
  slug?: string;
};

type RemoteCommentRow = {
  id: string;
  objectId: string;
  actorId: string;
  actorName: string | null;
  actorUrl: string | null;
  sourceHost: string | null;
  content: string;
  url: string | null;
  targetKind: string;
  targetId: number | null;
  targetSlug: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

type RemoteFeedPostRow = {
  id: string;
  objectId: string;
  actorId: string;
  actorName: string | null;
  actorUrl: string | null;
  sourceHost: string | null;
  title: string | null;
  content: string;
  url: string | null;
  tags: unknown;
  sourceType: string;
  publishedAt: Date | null;
  createdAt: Date;
};

export const remoteContentModerationSchema = z.object({
  kind: z.enum(["feed_post", "comment"]).optional(),
  id: z.string().trim().min(1),
  status: z.enum(["published", "hidden", "rejected"]).optional(),
  blockActor: z.boolean().optional().default(false),
  blockDomain: z.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional(),
});

function compactText(value: string | undefined | null, fallback: string | null = "") {
  return value?.trim() || fallback;
}

function sourceHostFrom(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function remoteTenantKey(tenantId?: string | null) {
  return tenantId ?? "default";
}

function canUseRawQueries() {
  return typeof (db as { $queryRawUnsafe?: unknown }).$queryRawUnsafe === "function";
}

function canUseRawExecute() {
  return typeof (db as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === "function";
}

function encodeFeedCursor(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : `feed:${date.toISOString()}`;
}

export function decodeFeedCursor(value: string | undefined | null) {
  if (!value?.startsWith("feed:")) return null;
  const date = new Date(value.slice("feed:".length));
  return Number.isNaN(date.getTime()) ? null : date;
}

function publicUrlFrom(value: CreateActivity["object"]["url"], fallback: string | undefined) {
  if (typeof value === "string") return value;
  return fallback ?? null;
}

function publishedDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTagName(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase();
}

export function extractRemoteTags(object: CreateActivity["object"]) {
  const rawTags = Array.isArray(object.tag) ? object.tag : object.tag ? [object.tag] : [];
  const tags = new Set<string>();

  for (const tag of rawTags) {
    if (typeof tag === "string") {
      const normalized = normalizeTagName(tag);
      if (normalized) tags.add(normalized);
      continue;
    }
    if (tag && typeof tag === "object") {
      const candidate = tag as { name?: unknown; href?: unknown };
      if (typeof candidate.name === "string") {
        const normalized = normalizeTagName(candidate.name);
        if (normalized) tags.add(normalized);
      }
      if (typeof candidate.href === "string") {
        const normalized = normalizeTagName(candidate.href.split("/").pop() ?? "");
        if (normalized) tags.add(normalized);
      }
    }
  }

  const searchable = `${object.name ?? ""} ${object.summary ?? ""} ${object.content ?? ""}`;
  for (const match of searchable.matchAll(/(^|\s)#([a-z0-9_][a-z0-9_-]*)/gi)) {
    tags.add(normalizeTagName(match[2]));
  }

  return [...tags].sort();
}

export function isD2JamTagged(activity: CreateActivity) {
  return extractRemoteTags(activity.object).includes("d2jam");
}

export function isLemmyCreate(activity: CreateActivity) {
  if (activity.object.type === "Page") return true;
  return sourceHostFrom(activity.object.id ?? activity.actor)?.includes("lemmy") ?? false;
}

async function actorSummary(activity: CreateActivity) {
  try {
    const actor = await resolveRemoteActorProfile(activity.object.attributedTo ?? activity.actor);
    return {
      actorId: activity.object.attributedTo ?? activity.actor,
      actorName: actor.name,
      actorUrl: actor.id,
    };
  } catch {
    return {
      actorId: activity.object.attributedTo ?? activity.actor,
      actorName: activity.object.attributedTo ?? activity.actor,
      actorUrl: activity.object.attributedTo ?? activity.actor,
    };
  }
}

export function presentRemoteComment(row: RemoteCommentRow) {
  return {
    id: `remote:${row.id}`,
    remoteId: row.id,
    objectId: row.objectId,
    content: row.content,
    createdAt: row.publishedAt ?? row.createdAt,
    updatedAt: row.publishedAt ?? row.createdAt,
    deletedAt: null,
    removedAt: null,
    parentId: null,
    authorId: null,
    author: {
      id: null,
      slug: row.actorUrl ?? row.actorId,
      name: row.actorName ?? row.actorId,
      profilePicture: null,
      remote: true,
      url: row.actorUrl ?? row.actorId,
      sourceHost: row.sourceHost,
    },
    likes: [],
    children: [],
    hasLiked: false,
    reactions: [],
    remote: true,
    federated: true,
    local: false,
    canReply: false,
    canReact: false,
    canEdit: false,
    canDelete: false,
    source: "federation",
    url: row.url,
  };
}

export function presentRemoteFeedPost(row: RemoteFeedPostRow) {
  return {
    id: `remote:${row.id}`,
    remoteId: row.id,
    objectId: row.objectId,
    slug: `remote-${row.id}`,
    title: row.title ?? "Federated post",
    content: row.content,
    sticky: false,
    createdAt: row.publishedAt ?? row.createdAt,
    updatedAt: row.publishedAt ?? row.createdAt,
    deletedAt: null,
    removedAt: null,
    authorId: null,
    author: {
      id: null,
      slug: row.actorUrl ?? row.actorId,
      name: row.actorName ?? row.actorId,
      profilePicture: null,
      remote: true,
      url: row.actorUrl ?? row.actorId,
      sourceHost: row.sourceHost,
    },
    tags: [],
    remoteTags: Array.isArray(row.tags) ? row.tags : [],
    likes: [],
    comments: [],
    hasLiked: false,
    reactions: [],
    remote: true,
    federated: true,
    local: false,
    canReply: false,
    canReact: false,
    canEdit: false,
    canDelete: false,
    source: "federation",
    sourceType: row.sourceType,
    url: row.url,
  };
}

export async function upsertRemoteFeedPostFromActivity(
  activity: CreateActivity,
  tenantId?: string | null,
) {
  if (!canUseRawQueries()) {
    return null;
  }

  const objectId = activity.object.id ?? activity.id;
  const actor = await actorSummary(activity);
  const tags = extractRemoteTags(activity.object);
  const rendered = buildFederatedContent({
    value: compactText(activity.object.content, activity.object.summary ?? activity.object.name ?? ""),
  });
  const rows = (await db.$queryRawUnsafe(
    `
      INSERT INTO "RemoteFeedPost"
        (id, tenant_id, activity_id, object_id, actor_id, actor_name, actor_url,
         source_host, title, content, url, tags, source_type, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
      ON CONFLICT (tenant_id, object_id)
      DO UPDATE SET
        activity_id = EXCLUDED.activity_id,
        actor_id = EXCLUDED.actor_id,
        actor_name = EXCLUDED.actor_name,
        actor_url = EXCLUDED.actor_url,
        source_host = EXCLUDED.source_host,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        url = EXCLUDED.url,
        tags = EXCLUDED.tags,
        source_type = EXCLUDED.source_type,
        published_at = EXCLUDED.published_at,
        updated_at = NOW()
      RETURNING id
    `,
    randomUUID(),
    remoteTenantKey(tenantId),
    activity.id,
    objectId,
    actor.actorId,
    actor.actorName,
    actor.actorUrl,
    sourceHostFrom(objectId) ?? sourceHostFrom(actor.actorId),
    compactText(activity.object.name, null),
    rendered.content,
    publicUrlFrom(activity.object.url, objectId),
    JSON.stringify(tags),
    isLemmyCreate(activity) ? "lemmy" : "activitypub",
    publishedDate(activity.object.published),
  )) as Array<{ id: string }>;

  return rows[0] ?? null;
}

export async function upsertRemoteCommentFromActivity({
  activity,
  reference,
  tenantId,
}: {
  activity: CreateActivity;
  reference: LocalReference;
  tenantId?: string | null;
}) {
  if (!canUseRawQueries()) {
    return null;
  }

  const objectId = activity.object.id ?? activity.id;
  const actor = await actorSummary(activity);
  const rendered = buildFederatedContent({ value: activity.object.content });
  const rows = (await db.$queryRawUnsafe(
    `
      INSERT INTO "RemoteComment"
        (id, tenant_id, activity_id, object_id, actor_id, actor_name, actor_url,
         source_host, content, url, target_kind, target_id, target_slug, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (tenant_id, object_id)
      DO UPDATE SET
        activity_id = EXCLUDED.activity_id,
        actor_id = EXCLUDED.actor_id,
        actor_name = EXCLUDED.actor_name,
        actor_url = EXCLUDED.actor_url,
        source_host = EXCLUDED.source_host,
        content = EXCLUDED.content,
        url = EXCLUDED.url,
        target_kind = EXCLUDED.target_kind,
        target_id = EXCLUDED.target_id,
        target_slug = EXCLUDED.target_slug,
        published_at = EXCLUDED.published_at,
        updated_at = NOW()
      RETURNING id
    `,
    randomUUID(),
    remoteTenantKey(tenantId),
    activity.id,
    objectId,
    actor.actorId,
    actor.actorName,
    actor.actorUrl,
    sourceHostFrom(objectId) ?? sourceHostFrom(actor.actorId),
    rendered.content,
    publicUrlFrom(activity.object.url, objectId),
    reference.kind,
    reference.id ?? null,
    reference.slug ?? null,
    publishedDate(activity.object.published),
  )) as Array<{ id: string }>;

  return rows[0] ?? null;
}

export async function listRemoteFeedPosts({
  tenantId,
  limit,
  cursor,
  sort = "newest",
}: {
  tenantId?: string | null;
  limit: number;
  cursor?: Date | null;
  sort?: "newest" | "oldest";
}) {
  if (!canUseRawQueries()) {
    return [];
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        object_id AS "objectId",
        actor_id AS "actorId",
        actor_name AS "actorName",
        actor_url AS "actorUrl",
        source_host AS "sourceHost",
        title,
        content,
        url,
        tags,
        source_type AS "sourceType",
        published_at AS "publishedAt",
        created_at AS "createdAt"
      FROM "RemoteFeedPost"
      WHERE tenant_id IS NOT DISTINCT FROM $1
        AND status = 'published'
        AND (
          $3::timestamptz IS NULL
          OR ($4::text = 'oldest' AND COALESCE(published_at, created_at) > $3::timestamptz)
          OR ($4::text <> 'oldest' AND COALESCE(published_at, created_at) < $3::timestamptz)
        )
      ORDER BY
        CASE WHEN $4::text = 'oldest' THEN COALESCE(published_at, created_at) END ASC,
        CASE WHEN $4::text <> 'oldest' THEN COALESCE(published_at, created_at) END DESC,
        created_at DESC
      LIMIT $2
    `,
    remoteTenantKey(tenantId),
    limit,
    cursor ?? null,
    sort,
  ).catch(() => [])) as RemoteFeedPostRow[];

  return rows.map(presentRemoteFeedPost);
}

export function getRemoteFeedCursorFromItem(item: unknown) {
  const createdAt = (item as { createdAt?: Date | string | null })?.createdAt;
  return encodeFeedCursor(createdAt);
}

export async function listRemoteCommentsForTarget({
  tenantId,
  kind,
  id,
  slug,
}: {
  tenantId?: string | null;
  kind: "post" | "comment" | "game" | "track";
  id?: number | null;
  slug?: string | null;
}) {
  if (!canUseRawQueries()) {
    return [];
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        object_id AS "objectId",
        actor_id AS "actorId",
        actor_name AS "actorName",
        actor_url AS "actorUrl",
        source_host AS "sourceHost",
        content,
        url,
        target_kind AS "targetKind",
        target_id AS "targetId",
        target_slug AS "targetSlug",
        published_at AS "publishedAt",
        created_at AS "createdAt"
      FROM "RemoteComment"
      WHERE tenant_id IS NOT DISTINCT FROM $1
        AND target_kind = $2
        AND status = 'published'
        AND ($3::int IS NULL OR target_id = $3)
        AND ($4::text IS NULL OR target_slug = $4)
      ORDER BY COALESCE(published_at, created_at) ASC, created_at ASC
    `,
    remoteTenantKey(tenantId),
    kind,
    id ?? null,
    slug ?? null,
  ).catch(() => [])) as RemoteCommentRow[];

  return rows.map(presentRemoteComment);
}

export async function listRemoteContentForModeration({
  tenantId,
  limit = 100,
}: {
  tenantId?: string | null;
  limit?: number;
}) {
  if (!canUseRawQueries()) {
    return { feedPosts: [], comments: [] };
  }

  const feedPosts = await db.$queryRawUnsafe(
    `
      SELECT
        id,
        object_id AS "objectId",
        actor_id AS "actorId",
        actor_name AS "actorName",
        actor_url AS "actorUrl",
        source_host AS "sourceHost",
        title,
        content,
        url,
        tags,
        source_type AS "sourceType",
        status,
        published_at AS "publishedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM "RemoteFeedPost"
      WHERE tenant_id IS NOT DISTINCT FROM $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    remoteTenantKey(tenantId),
    limit,
  ).catch(() => []);

  const comments = await db.$queryRawUnsafe(
    `
      SELECT
        id,
        object_id AS "objectId",
        actor_id AS "actorId",
        actor_name AS "actorName",
        actor_url AS "actorUrl",
        source_host AS "sourceHost",
        content,
        url,
        target_kind AS "targetKind",
        target_id AS "targetId",
        target_slug AS "targetSlug",
        status,
        published_at AS "publishedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM "RemoteComment"
      WHERE tenant_id IS NOT DISTINCT FROM $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    remoteTenantKey(tenantId),
    limit,
  ).catch(() => []);

  return { feedPosts, comments };
}

export async function moderateRemoteContent({
  input,
  tenantId,
  actorId,
}: {
  input: z.infer<typeof remoteContentModerationSchema>;
  tenantId?: string | null;
  actorId?: number | null;
}) {
  if (!canUseRawQueries() || !canUseRawExecute()) {
    return { ok: true };
  }

  if (!input.kind) {
    return { ok: false, message: "Remote content kind is required" };
  }

  const table =
    input.kind === "feed_post" ? '"RemoteFeedPost"' : '"RemoteComment"';
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT actor_id AS "actorId", source_host AS "sourceHost"
      FROM ${table}
      WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2
      LIMIT 1
    `,
    input.id,
    remoteTenantKey(tenantId),
  )) as Array<{ actorId: string; sourceHost: string | null }>;
  const row = rows[0];
  if (!row) return { ok: false, message: "Remote content not found" };

  if (input.status) {
    await db.$executeRawUnsafe(
      `
        UPDATE ${table}
        SET status = $3, updated_at = NOW()
        WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2
      `,
      input.id,
      remoteTenantKey(tenantId),
      input.status,
    );
  }

  if (input.blockActor) {
    await createFederationBlock({
      input: {
        blockType: "actor",
        value: row.actorId,
        reason: input.reason ?? "Blocked from remote content moderation",
      },
      tenantId,
      actorId,
    });
  }

  if (input.blockDomain && row.sourceHost) {
    await createFederationBlock({
      input: {
        blockType: "domain",
        value: row.sourceHost,
        reason: input.reason ?? "Blocked from remote content moderation",
      },
      tenantId,
      actorId,
    });
  }

  return { ok: true };
}
