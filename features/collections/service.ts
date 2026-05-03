import { randomUUID } from "node:crypto";
import { z } from "zod";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors.js";

type CollectionActor = {
  id: number;
  slug: string;
  mod?: boolean | null;
  admin?: boolean | null;
};

const collectionTypeSchema = z.enum(["game", "music", "post"]);
const collectionSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab case.")
  .max(80);
type CollectionIdentifier = string | number;

type CollectionRow = {
  id: number;
  tenantId: string | null;
  forkedFromId?: number | null;
  ownerId: number;
  ownerSlug: string;
  ownerName: string;
  slug: string;
  title: string;
  description: string | null;
  collectionType: "game" | "music" | "post";
  visibility: "private" | "unlisted" | "public";
  playbackMode?: "manual" | "shuffle" | "repeat";
  createdAt: Date;
  updatedAt: Date;
};

type CollectionItemRow = {
  id: number;
  collectionId: number;
  itemType: "game" | "post" | "track" | "youtube_track";
  itemId: number;
  title: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  platformLinks: Array<{
    platform: "youtube" | "youtubeMusic" | "d2jam";
    url: string;
  }> | null;
  note: string | null;
  position: number;
  addedAt: Date;
};

type CollectionCollaboratorRow = {
  id: number;
  collectionId: number;
  userId: number;
  userSlug: string;
  userName: string;
  role: "viewer" | "editor";
  status: "pending" | "accepted" | "declined";
  invitedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export const collectionVisibilitySchema = z.enum(["private", "unlisted", "public"]);

export const createCollectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: collectionSlugSchema.optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  collectionType: collectionTypeSchema.optional().default("music"),
  visibility: collectionVisibilitySchema.optional().default("private"),
  playbackMode: z.enum(["manual", "shuffle", "repeat"]).optional().default("manual"),
});

export const updateCollectionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    slug: collectionSlugSchema.optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    collectionType: collectionTypeSchema.optional(),
    visibility: collectionVisibilitySchema.optional(),
    playbackMode: z.enum(["manual", "shuffle", "repeat"]).optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.slug !== undefined ||
      payload.description !== undefined ||
      payload.collectionType !== undefined ||
      payload.visibility !== undefined ||
      payload.playbackMode !== undefined,
    { message: "No update fields provided." },
  );

export const collectionItemSchema = z.object({
  itemType: z.enum(["game", "post", "track", "youtube_track"]),
  itemId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200).optional().nullable(),
  url: z.string().trim().url().optional().nullable(),
  thumbnailUrl: z.string().trim().url().optional().nullable(),
  platformLinks: z
    .array(
      z.object({
        platform: z.enum(["youtube", "youtubeMusic", "d2jam"]),
        url: z.string().trim().url(),
      }),
    )
    .max(6)
    .optional()
    .nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  position: z.coerce.number().int().optional().default(0),
}).superRefine((input, ctx) => {
  if (input.itemType === "youtube_track") {
    if (!input.url && !input.platformLinks?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "A YouTube collection item needs a URL.",
      });
    }
    return;
  }

  if (!input.itemId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["itemId"],
      message: "A site collection item needs an itemId.",
    });
  }
});

export const updateCollectionItemSchema = z
  .object({
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((payload) => payload.note !== undefined, {
    message: "No update fields provided.",
  });

export const inviteCollectionCollaboratorSchema = z.object({
  userSlug: z.string().trim().min(1),
  role: z.enum(["viewer", "editor"]).optional().default("viewer"),
});

export const respondCollectionCollaboratorSchema = z.object({
  status: z.enum(["accepted", "declined"]),
});

export const collectionCommentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const collectionImportSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  visibility: collectionVisibilitySchema.optional().default("private"),
  playbackMode: z.enum(["manual", "shuffle", "repeat"]).optional().default("manual"),
  sourceName: z.string().trim().max(200).optional().nullable(),
  items: z.array(collectionItemSchema).min(1).max(250),
}).strict();

export const listCollectionsQuerySchema = z.object({
  userSlug: z.string().trim().min(1).optional(),
  mine: z.union([z.literal("true"), z.literal("false")]).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  itemType: z.enum(["game", "post", "track", "youtube_track", "music"]).optional(),
  collectionType: collectionTypeSchema.optional(),
  sort: z.enum(["updated", "popular", "largest"]).optional().default("updated"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().datetime().optional(),
});

export const collectionCommentsQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stablePositiveHash(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 2147483647) + 1;
}

function summarizePostContent(content: string) {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function canonicalExternalKey(input: z.infer<typeof collectionItemSchema>) {
  const primaryUrl =
    input.url ??
    input.platformLinks?.find((link) => link.platform === "youtube")?.url ??
    input.platformLinks?.[0]?.url ??
    input.title ??
    "external";

  try {
    const parsed = new URL(primaryUrl);
    const videoId = parsed.searchParams.get("v");
    if (videoId) return `${parsed.hostname}:${videoId}`;
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return primaryUrl.toLowerCase();
  }
}

function parseYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (host === "youtube.com" || host === "music.youtube.com" || host.endsWith(".youtube.com")) {
      return parsed.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveCollectionMusicMetadata(input: {
  url: string;
  title?: string | null;
  thumbnailUrl?: string | null;
}) {
  const url = input.url.trim();
  const videoId = parseYouTubeVideoId(url);
  const fallbackTitle = input.title?.trim() || "YouTube music";
  const fallbackThumbnail =
    input.thumbnailUrl?.trim() ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "Jamcore/1.0",
        },
      },
    );
    if (response.ok) {
      const data = (await response.json()) as {
        title?: string;
        thumbnail_url?: string;
        author_name?: string;
      };
      return {
        title: data.title?.trim() || fallbackTitle,
        thumbnailUrl: data.thumbnail_url?.trim() || fallbackThumbnail,
        authorName: data.author_name?.trim() || null,
        url,
        videoId,
      };
    }
  } catch {
    // Metadata lookup is best effort; the item can still be saved.
  }

  return {
    title: fallbackTitle,
    thumbnailUrl: fallbackThumbnail,
    authorName: null,
    url,
    videoId,
  };
}

async function buildUniqueCollectionSlug(_ownerId: number, title: string, tenantId?: string | null) {
  const base = slugify(title) || "collection";
  let slug = base;
  let suffix = 1;

  while (true) {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "Collection"
        WHERE slug = $1
          AND tenant_id IS NOT DISTINCT FROM $2
        LIMIT 1
      `,
      slug,
      tenantId ?? null,
    )) as Array<{ id: number }>;
    if (rows.length === 0) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

async function getCollaborator(collectionId: number, userId?: number | null) {
  if (!userId) return null;
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        collection_id AS "collectionId",
        user_id AS "userId",
        role,
        status,
        invited_by AS "invitedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM "CollectionCollaborator"
      WHERE collection_id = $1 AND user_id = $2
      LIMIT 1
    `,
    collectionId,
    userId,
  )) as Array<CollectionCollaboratorRow>;
  return rows[0] ?? null;
}

async function canViewCollection(row: CollectionRow, actor?: CollectionActor | null) {
  const collaborator = await getCollaborator(row.id, actor?.id);
  return (
    row.visibility !== "private" ||
    actor?.id === row.ownerId ||
    actor?.mod === true ||
    actor?.admin === true ||
    collaborator?.status === "accepted"
  );
}

async function canManageCollection(row: CollectionRow, actor?: CollectionActor | null) {
  const collaborator = await getCollaborator(row.id, actor?.id);
  return (
    actor?.id === row.ownerId ||
    actor?.mod === true ||
    actor?.admin === true ||
    (collaborator?.status === "accepted" && collaborator.role === "editor")
  );
}

async function getCollectionRow(identifier: CollectionIdentifier) {
  const numericId =
    typeof identifier === "number" || /^\d+$/.test(String(identifier))
      ? Number(identifier)
      : null;
  const slug = String(identifier);
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        c.id,
        c.tenant_id AS "tenantId",
        c.forked_from_id AS "forkedFromId",
        c.owner_id AS "ownerId",
        u.slug AS "ownerSlug",
        u.name AS "ownerName",
        c.slug,
        c.title,
        c.description,
        c.collection_type AS "collectionType",
        c.visibility,
        c.playback_mode AS "playbackMode",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM "Collection" c
      JOIN "User" u ON u.id = c.owner_id
      WHERE (($1::int IS NOT NULL AND c.id = $1::int) OR c.slug = $2)
      LIMIT 1
    `,
    numericId,
    slug,
  )) as CollectionRow[];
  return rows[0] ?? null;
}

async function listCollectionItems(collectionId: number) {
  return (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        collection_id AS "collectionId",
        item_type AS "itemType",
        item_id AS "itemId",
        title,
        url,
        thumbnail_url AS "thumbnailUrl",
        platform_links AS "platformLinks",
        note,
        position,
        added_at AS "addedAt"
      FROM "CollectionItem"
      WHERE collection_id = $1
      ORDER BY position ASC, added_at ASC
    `,
    collectionId,
  )) as CollectionItemRow[];
}

async function listCollectionCollaborators(collectionId: number) {
  return (await db.$queryRawUnsafe(
    `
      SELECT
        c.id,
        c.collection_id AS "collectionId",
        c.user_id AS "userId",
        u.slug AS "userSlug",
        u.name AS "userName",
        c.role,
        c.status,
        c.invited_by AS "invitedBy",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM "CollectionCollaborator" c
      JOIN "User" u ON u.id = c.user_id
      WHERE c.collection_id = $1
      ORDER BY c.created_at DESC
    `,
    collectionId,
  )) as CollectionCollaboratorRow[];
}

async function listCollectionComments(collectionId: number, input?: z.infer<typeof collectionCommentsQuerySchema>) {
  return db.$queryRawUnsafe(
    `
      SELECT
        c.id,
        c.collection_id AS "collectionId",
        c.author_id AS "authorId",
        u.slug AS "authorSlug",
        u.name AS "authorName",
        u."profilePicture" AS "authorProfilePicture",
        c.content,
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM "CollectionComment" c
      JOIN "User" u ON u.id = c.author_id
      WHERE c.collection_id = $1 AND c.deleted_at IS NULL
        AND ($2::timestamptz IS NULL OR c.created_at < $2::timestamptz)
      ORDER BY c.created_at DESC
      LIMIT $3
    `,
    collectionId,
    input?.cursor ?? null,
    input?.limit ?? 50,
  ).catch(() => []);
}

async function countCollectionFollowers(collectionId: number) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT COUNT(*)::int AS count
      FROM "CollectionFollow"
      WHERE collection_id = $1
    `,
    collectionId,
  ).catch(() => [])) as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

async function listCollectionNotificationRecipientIds(collectionId: number, actorId: number) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT owner_id AS "userId"
      FROM "Collection"
      WHERE id = $1
      UNION
      SELECT user_id AS "userId"
      FROM "CollectionCollaborator"
      WHERE collection_id = $1 AND status = 'accepted'
      UNION
      SELECT user_id AS "userId"
      FROM "CollectionFollow"
      WHERE collection_id = $1
    `,
    collectionId,
  ).catch(() => [])) as Array<{ userId: number }>;
  return [...new Set(rows.map((row) => row.userId).filter((userId) => userId !== actorId))];
}

async function notifyCollectionRecipients({
  collection,
  actor,
  title,
  body,
  data,
}: {
  collection: CollectionRow;
  actor: CollectionActor;
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  const recipientIds = await listCollectionNotificationRecipientIds(collection.id, actor.id);
  if (recipientIds.length === 0) return;
  await db.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      actorId: actor.id,
      type: "GENERAL",
      title,
      body,
      link: `/c/${collection.slug}`,
      data: {
        kind: "collection",
        collectionId: collection.id,
        ...data,
      },
    })),
  });
}

async function enrichCollectionItems(items: CollectionItemRow[]) {
  const gameIds = items
    .filter((item) => item.itemType === "game")
    .map((item) => item.itemId);
  const trackIds = items
    .filter((item) => item.itemType === "track")
    .map((item) => item.itemId);
  const postIds = items
    .filter((item) => item.itemType === "post")
    .map((item) => item.itemId);

  const [games, tracks, posts] = await Promise.all([
    gameIds.length
      ? db.game.findMany({
          where: { id: { in: gameIds } },
          select: {
            id: true,
            slug: true,
            pages: {
              orderBy: { version: "desc" },
              take: 1,
              select: {
                name: true,
                thumbnail: true,
                banner: true,
                short: true,
              },
            },
          },
        })
      : [],
    trackIds.length
      ? db.gamePageTrack.findMany({
          where: { id: { in: trackIds } },
          select: {
            id: true,
            slug: true,
            name: true,
            url: true,
            gamePage: {
              select: {
                name: true,
                thumbnail: true,
                game: {
                  select: {
                    slug: true,
                  },
                },
              },
            },
            composer: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        })
      : [],
    postIds.length
      ? db.post.findMany({
          where: { id: { in: postIds }, deletedAt: null, removedAt: null },
          select: {
            id: true,
            slug: true,
            title: true,
            content: true,
            author: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        })
      : [],
  ]);

  const gamesById = new Map(games.map((game) => [game.id, game]));
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const postsById = new Map(posts.map((post) => [post.id, post]));

  return items.map((item) => {
    if (item.itemType === "game") {
      const game = gamesById.get(item.itemId);
      const page = game?.pages[0];
      return {
        ...item,
        game: game
          ? {
              id: game.id,
              slug: game.slug,
              name: page?.name ?? "Untitled game",
              thumbnail: page?.thumbnail ?? page?.banner ?? null,
              short: page?.short ?? null,
            }
          : null,
      };
    }

    if (item.itemType === "track") {
      const track = tracksById.get(item.itemId);
      return {
        ...item,
        track: track
          ? {
              id: track.id,
              slug: track.slug,
              name: track.name,
              url: track.url,
              thumbnail: track.gamePage.thumbnail ?? null,
              game: {
                slug: track.gamePage.game.slug,
                name: track.gamePage.name,
              },
              composer: track.composer,
            }
          : null,
      };
    }

    if (item.itemType === "post") {
      const post = postsById.get(item.itemId);
      return {
        ...item,
        post: post
          ? {
              id: post.id,
              slug: post.slug,
              title: post.title,
              contentExcerpt: summarizePostContent(post.content),
              author: post.author,
            }
          : null,
      };
    }

    return item;
  });
}

async function getCollectionItemCounts(collectionIds: number[]) {
  if (collectionIds.length === 0) return new Map<number, { total: number; types: Record<string, number> }>();
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT collection_id AS "collectionId", item_type AS "itemType", COUNT(*)::int AS count
      FROM "CollectionItem"
      WHERE collection_id = ANY($1::int[])
      GROUP BY collection_id, item_type
    `,
    collectionIds,
  )) as Array<{ collectionId: number; itemType: string; count: number }>;
  const counts = new Map<number, { total: number; types: Record<string, number> }>();
  for (const row of rows) {
    const current = counts.get(row.collectionId) ?? { total: 0, types: {} };
    current.total += row.count;
    current.types[row.itemType] = row.count;
    counts.set(row.collectionId, current);
  }
  return counts;
}

async function getCollectionPreviewItems(collectionIds: number[]) {
  if (collectionIds.length === 0) return new Map<number, Awaited<ReturnType<typeof enrichCollectionItems>>>();
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        collection_id AS "collectionId",
        item_type AS "itemType",
        item_id AS "itemId",
        title,
        url,
        thumbnail_url AS "thumbnailUrl",
        platform_links AS "platformLinks",
        note,
        position,
        added_at AS "addedAt"
      FROM (
        SELECT
          ci.*,
          ROW_NUMBER() OVER (
            PARTITION BY ci.collection_id
            ORDER BY ci.position ASC, ci.added_at ASC
          ) AS preview_rank
        FROM "CollectionItem" ci
        WHERE ci.collection_id = ANY($1::int[])
      ) ranked_items
      WHERE preview_rank <= 2
      ORDER BY collection_id ASC, position ASC, added_at ASC
    `,
    collectionIds,
  )) as CollectionItemRow[];
  const enriched = await enrichCollectionItems(rows);
  const previews = new Map<number, typeof enriched>();
  for (const item of enriched) {
    const current = previews.get(item.collectionId) ?? [];
    current.push(item);
    previews.set(item.collectionId, current);
  }
  return previews;
}

async function presentCollection(
  row: CollectionRow,
  includeItems = true,
  itemCounts?: { total: number; types: Record<string, number> },
  previewItems?: Awaited<ReturnType<typeof enrichCollectionItems>>,
) {
  const items = includeItems ? await listCollectionItems(row.id) : undefined;
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    collectionType: row.collectionType,
    playbackMode: row.playbackMode ?? "manual",
    forkedFromId: row.forkedFromId ?? null,
    owner: {
      id: row.ownerId,
      slug: row.ownerSlug,
      name: row.ownerName,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemCount: itemCounts?.total ?? items?.length ?? 0,
    itemTypes: itemCounts?.types ?? undefined,
    previewItems: includeItems ? undefined : previewItems,
    items: items ? await enrichCollectionItems(items) : undefined,
    collaborators: includeItems ? await listCollectionCollaborators(row.id) : undefined,
    comments: includeItems ? await listCollectionComments(row.id) : undefined,
    followerCount: await countCollectionFollowers(row.id),
  };
}

async function assertItemVisible(
  itemType: "game" | "post" | "track" | "youtube_track",
  itemId: number,
  tenantId?: string | null,
) {
  if (itemType === "youtube_track") return;

  if (itemType === "game") {
    const game = await db.game.findUnique({
      where: { id: itemId },
      select: { id: true, published: true },
    });
    if (!game?.published) throw new NotFoundError("Game not found");
    const allowed = await filterCoreEntityIdsByTenant({ entityType: "Game", ids: [itemId], tenantId });
    if (!allowed.includes(itemId)) throw new NotFoundError("Game not found");
    return;
  }

  if (itemType === "post") {
    const post = await db.post.findUnique({
      where: { id: itemId },
      select: { id: true, deletedAt: true, removedAt: true },
    });
    if (!post || post.deletedAt || post.removedAt) throw new NotFoundError("Post not found");
    const allowed = await filterCoreEntityIdsByTenant({ entityType: "Post", ids: [itemId], tenantId });
    if (!allowed.includes(itemId)) throw new NotFoundError("Post not found");
    return;
  }

  const track = await db.gamePageTrack.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      gamePage: {
        select: {
          game: {
            select: { id: true, published: true },
          },
        },
      },
    },
  });
  if (!track?.gamePage.game.published) throw new NotFoundError("Track not found");
  const allowed = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [track.gamePage.game.id],
    tenantId,
  });
  if (!allowed.includes(track.gamePage.game.id)) throw new NotFoundError("Track not found");
}

export async function createCollection({
  actor,
  input,
  tenantId,
}: {
  actor: CollectionActor;
  input: z.infer<typeof createCollectionSchema>;
  tenantId?: string | null;
}) {
  const slug = await buildUniqueCollectionSlug(actor.id, input.slug ?? input.title, tenantId);
  const created = (await db.$queryRawUnsafe(
    `
      INSERT INTO "Collection"
      (tenant_id, owner_id, slug, title, description, collection_type, visibility, playback_mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    tenantId ?? null,
    actor.id,
    slug,
    input.title,
    input.description ?? null,
    input.collectionType,
    input.visibility,
    input.playbackMode,
  )) as Array<{ id: number }>;

  const row = await getCollectionRow(created[0]?.id ?? slug);
  if (!row) throw new BadRequestError("Collection could not be created");
  return presentCollection(row);
}

export async function listCollections({
  actor,
  input,
  tenantId,
}: {
  actor?: CollectionActor | null;
  input: z.infer<typeof listCollectionsQuerySchema>;
  tenantId?: string | null;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const ownerFilter =
    input.mine === "true" && actor ? { ownerId: null, ownerSlug: null } : { ownerId: null, ownerSlug: input.userSlug ?? null };

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        c.id,
        c.tenant_id AS "tenantId",
        c.forked_from_id AS "forkedFromId",
        c.owner_id AS "ownerId",
        u.slug AS "ownerSlug",
        u.name AS "ownerName",
        c.slug,
        c.title,
        c.description,
        c.collection_type AS "collectionType",
        c.visibility,
        c.playback_mode AS "playbackMode",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM "Collection" c
      JOIN "User" u ON u.id = c.owner_id
      LEFT JOIN "CollectionCollaborator" cc
        ON cc.collection_id = c.id
        AND cc.user_id = $4
        AND cc.status = 'accepted'
      WHERE c.tenant_id IS NOT DISTINCT FROM $1
        AND ($2::int IS NULL OR c.owner_id = $2)
        AND ($3::text IS NULL OR u.slug = $3)
        AND ($7::boolean = false OR c.owner_id = $4 OR cc.id IS NOT NULL)
        AND ($11::timestamptz IS NULL OR c.updated_at < $11::timestamptz)
        AND ($8::text IS NULL OR c.title ILIKE '%' || $8 || '%' OR c.description ILIKE '%' || $8 || '%')
        AND ($12::text IS NULL OR c.collection_type = $12)
        AND ($9::text IS NULL OR EXISTS (
          SELECT 1 FROM "CollectionItem" typed_item
          WHERE typed_item.collection_id = c.id
            AND (
              ($9 = 'music' AND typed_item.item_type IN ('track', 'youtube_track'))
              OR typed_item.item_type = $9
            )
        ))
        AND (
          c.visibility = 'public'
          OR (c.visibility = 'unlisted' AND ($3::text IS NOT NULL OR $7::boolean = true))
          OR c.owner_id = $4
          OR cc.id IS NOT NULL
          OR $5::boolean = true
        )
      ORDER BY
        CASE WHEN $10 = 'largest' THEN (
          SELECT COUNT(*) FROM "CollectionItem" count_items WHERE count_items.collection_id = c.id
        ) END DESC,
        CASE WHEN $10 = 'popular' THEN (
          SELECT COUNT(*) FROM "CollectionCollaborator" count_collabs WHERE count_collabs.collection_id = c.id AND count_collabs.status = 'accepted'
        ) END DESC,
        c.updated_at DESC
      LIMIT $6
    `,
    tenantId ?? null,
    ownerFilter.ownerId,
    ownerFilter.ownerSlug,
    actor?.id ?? null,
    Boolean(actor?.mod || actor?.admin),
    limit,
    input.mine === "true" && Boolean(actor),
    input.q ?? null,
    input.itemType ?? null,
    input.sort ?? "updated",
    input.cursor ?? null,
    input.collectionType ?? null,
  )) as CollectionRow[];

  const collectionIds = rows.map((row) => row.id);
  const [counts, previewItems] = await Promise.all([
    getCollectionItemCounts(collectionIds),
    getCollectionPreviewItems(collectionIds),
  ]);
  return Promise.all(
    rows.map((row) => presentCollection(row, false, counts.get(row.id), previewItems.get(row.id))),
  );
}

export async function getCollection({
  collectionId,
  actor,
}: {
  collectionId: CollectionIdentifier;
  actor?: CollectionActor | null;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  return presentCollection(row);
}

export async function updateCollection({
  collectionId,
  actor,
  input,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  input: z.infer<typeof updateCollectionSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");

  const slug = input.slug
    ? await buildUniqueCollectionSlug(actor.id, input.slug, row.tenantId)
    : null;
  await db.$executeRawUnsafe(
    `
      UPDATE "Collection"
      SET
        title = COALESCE($2, title),
        slug = COALESCE($3, slug),
        description = COALESCE($4, description),
        collection_type = COALESCE($5, collection_type),
        visibility = COALESCE($6, visibility),
        playback_mode = COALESCE($7, playback_mode),
        updated_at = NOW()
      WHERE id = $1
    `,
    row.id,
    input.title ?? null,
    slug,
    input.description ?? null,
    input.collectionType ?? null,
    input.visibility ?? null,
    input.playbackMode ?? null,
  );

  const updated = await getCollectionRow(row.id);
  if (!updated) throw new NotFoundError("Collection not found");
  return presentCollection(updated);
}

export async function forkCollection({
  collectionId,
  actor,
  tenantId,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  tenantId?: string | null;
}) {
  const source = await getCollectionRow(collectionId);
  if (!source || !(await canViewCollection(source, actor))) {
    throw new NotFoundError("Collection not found");
  }

  const title = `${source.title} fork`;
  const slug = await buildUniqueCollectionSlug(actor.id, title, tenantId);
  const created = (await db.$queryRawUnsafe(
    `
      INSERT INTO "Collection"
      (tenant_id, owner_id, slug, title, description, collection_type, visibility, playback_mode, forked_from_id)
      VALUES ($1, $2, $3, $4, $5, $6, 'private', $7, $8)
      RETURNING id
    `,
    tenantId ?? null,
    actor.id,
    slug,
    title,
    source.description,
    source.collectionType,
    source.playbackMode ?? "manual",
    source.id,
  )) as Array<{ id: number }>;
  const newCollectionId = created[0]?.id;
  if (!newCollectionId) throw new BadRequestError("Collection could not be created");

  const items = await listCollectionItems(source.id);
  for (const item of items) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO "CollectionItem"
        (collection_id, item_type, item_id, title, url, thumbnail_url, platform_links, note, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      `,
      newCollectionId,
      item.itemType,
      item.itemId,
      item.title,
      item.url,
      item.thumbnailUrl,
      item.platformLinks ? JSON.stringify(item.platformLinks) : null,
      item.note,
      item.position,
    );
  }

  const row = await getCollectionRow(newCollectionId ?? slug);
  if (!row) throw new NotFoundError("Collection not found");
  if (source.ownerId !== actor.id) {
    await db.notification.create({
      data: {
        recipientId: source.ownerId,
        actorId: actor.id,
        type: "GENERAL",
        title: `${actor.slug} forked your collection`,
        body: source.title,
        link: `/c/${source.slug}`,
        data: { kind: "collection_fork", collectionId: source.id },
      },
    });
  }
  return presentCollection(row);
}

export async function getCollectionPlayback({
  collectionId,
  actor,
  shuffle,
}: {
  collectionId: CollectionIdentifier;
  actor?: CollectionActor | null;
  shuffle?: boolean;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  const tracks = (await db.$queryRawUnsafe(
    `
      SELECT
        ci.id AS "itemId",
        ci.position,
        t.id AS "trackId",
        t.slug,
        t.name,
        t.filename,
        gp.name AS "gamePageName",
        g.slug AS "gameSlug"
      FROM "CollectionItem" ci
      JOIN "GamePageTrack" t ON t.id = ci.item_id
      JOIN "GamePage" gp ON gp.id = t."gamePageId"
      JOIN "Game" g ON g.id = gp."gameId"
      WHERE ci.collection_id = $1 AND ci.item_type = 'track' AND g.published = true
      ORDER BY ci.position ASC, ci.added_at ASC
    `,
    row.id,
  )) as Array<Record<string, unknown>>;
  const queue =
    shuffle || row.playbackMode === "shuffle"
      ? [...tracks].sort(() => Math.random() - 0.5)
      : tracks;
  return {
    collection: await presentCollection(row, false),
    mode: row.playbackMode ?? "manual",
    queue,
  };
}

export async function deleteCollection({
  collectionId,
  actor,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  await db.$executeRawUnsafe(`DELETE FROM "Collection" WHERE id = $1`, row.id);
  return { ok: true };
}

export async function addCollectionItem({
  collectionId,
  actor,
  input,
  tenantId,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  input: z.infer<typeof collectionItemSchema>;
  tenantId?: string | null;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  const normalizedItemId =
    input.itemType === "youtube_track"
      ? stablePositiveHash(canonicalExternalKey(input))
      : input.itemId;
  if (!normalizedItemId) {
    throw new BadRequestError("Item ID is required");
  }
  await assertItemVisible(input.itemType, normalizedItemId, tenantId);
  const externalMusicUrl =
    input.itemType === "youtube_track"
      ? input.url ??
        input.platformLinks?.find((link) => link.platform === "youtube")?.url ??
        input.platformLinks?.find((link) => link.platform === "youtubeMusic")?.url ??
        input.platformLinks?.[0]?.url ??
        null
      : null;
  const externalMetadata = externalMusicUrl
    ? await resolveCollectionMusicMetadata({
        url: externalMusicUrl,
        title: input.title,
        thumbnailUrl: input.thumbnailUrl,
      })
    : null;

  await db.$executeRawUnsafe(
    `
      INSERT INTO "CollectionItem"
      (collection_id, item_type, item_id, title, url, thumbnail_url, platform_links, note, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      ON CONFLICT (collection_id, item_type, item_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        platform_links = EXCLUDED.platform_links,
        note = EXCLUDED.note,
        position = EXCLUDED.position
    `,
    row.id,
    input.itemType,
    normalizedItemId,
    externalMetadata?.title ?? input.title ?? null,
    externalMetadata?.url ?? input.url ?? null,
    externalMetadata?.thumbnailUrl ?? input.thumbnailUrl ?? null,
    input.platformLinks ? JSON.stringify(input.platformLinks) : null,
    input.note ?? null,
    input.position,
  );
  await db.$executeRawUnsafe(
    `UPDATE "Collection" SET updated_at = NOW() WHERE id = $1`,
    row.id,
  );
  return getCollection({ collectionId: row.id, actor });
}

export async function updateCollectionItem({
  collectionId,
  itemId,
  actor,
  input,
}: {
  collectionId: CollectionIdentifier;
  itemId: number;
  actor: CollectionActor;
  input: z.infer<typeof updateCollectionItemSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  await db.$executeRawUnsafe(
    `
      UPDATE "CollectionItem"
      SET note = $1
      WHERE id = $2 AND collection_id = $3
    `,
    input.note?.trim() || null,
    itemId,
    row.id,
  );
  await db.$executeRawUnsafe(
    `UPDATE "Collection" SET updated_at = NOW() WHERE id = $1`,
    row.id,
  );
  return getCollection({ collectionId: row.id, actor });
}

export async function removeCollectionItem({
  collectionId,
  itemId,
  actor,
}: {
  collectionId: CollectionIdentifier;
  itemId: number;
  actor: CollectionActor;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  await db.$executeRawUnsafe(
    `DELETE FROM "CollectionItem" WHERE id = $1 AND collection_id = $2`,
    itemId,
    row.id,
  );
  await db.$executeRawUnsafe(
    `UPDATE "Collection" SET updated_at = NOW() WHERE id = $1`,
    row.id,
  );
  return { ok: true };
}

export async function inviteCollectionCollaborator({
  collectionId,
  actor,
  input,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  input: z.infer<typeof inviteCollectionCollaboratorSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (row.ownerId !== actor.id && !actor.mod && !actor.admin) {
    throw new ForbiddenError("Only the owner can invite collaborators");
  }
  const user = await db.user.findUnique({
    where: { slug: input.userSlug },
    select: { id: true },
  });
  if (!user) throw new NotFoundError("User not found");
  await db.$executeRawUnsafe(
    `
      INSERT INTO "CollectionCollaborator"
      (collection_id, user_id, role, status, invited_by)
      VALUES ($1, $2, $3, 'pending', $4)
      ON CONFLICT (collection_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'pending', invited_by = EXCLUDED.invited_by, updated_at = NOW()
    `,
    row.id,
    user.id,
    input.role,
    actor.id,
  );
  await db.notification.create({
    data: {
      recipientId: user.id,
      actorId: actor.id,
      type: "GENERAL",
      title: `${actor.slug} invited you to collaborate on a collection`,
      body: row.title,
      link: `/c/${row.slug}`,
      data: { kind: "collection_collaborator_invite", collectionId: row.id, role: input.role },
    },
  });
  return getCollection({ collectionId: row.id, actor });
}

export async function respondCollectionCollaboratorInvite({
  collectionId,
  actor,
  input,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  input: z.infer<typeof respondCollectionCollaboratorSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  await db.$executeRawUnsafe(
    `
      UPDATE "CollectionCollaborator"
      SET status = $3, updated_at = NOW()
      WHERE collection_id = $1 AND user_id = $2
    `,
    row.id,
    actor.id,
    input.status,
  );
  if (row && row.ownerId !== actor.id) {
    await db.notification.create({
      data: {
        recipientId: row.ownerId,
        actorId: actor.id,
        type: "GENERAL",
        title: `${actor.slug} ${input.status} your collection invite`,
        body: row.title,
        link: `/c/${row.slug}`,
        data: { kind: "collection_collaborator_response", collectionId: row.id, status: input.status },
      },
    });
  }
  return getCollection({ collectionId: row.id, actor });
}

export async function addCollectionComment({
  collectionId,
  actor,
  input,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  input: z.infer<typeof collectionCommentSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  const comments = (await db.$queryRawUnsafe(
    `
      INSERT INTO "CollectionComment"
      (collection_id, author_id, content)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    row.id,
    actor.id,
    input.content,
  )) as Array<{ id: number }>;
  const commentId = comments[0]?.id;
  await notifyCollectionRecipients({
    collection: row,
    actor,
    title: `${actor.slug} commented on a collection`,
    body: row.title,
    data: { kind: "collection_comment", commentId },
  });
  return getCollection({ collectionId: row.id, actor });
}

export async function getCollectionComments({
  collectionId,
  actor,
  input,
}: {
  collectionId: CollectionIdentifier;
  actor?: CollectionActor | null;
  input: z.infer<typeof collectionCommentsQuerySchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  const items = await listCollectionComments(row.id, input);
  return { items };
}

export async function deleteCollectionComment({
  collectionId,
  commentId,
  actor,
}: {
  collectionId: CollectionIdentifier;
  commentId: number;
  actor: CollectionActor;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  const comments = (await db.$queryRawUnsafe(
    `
      SELECT author_id AS "authorId"
      FROM "CollectionComment"
      WHERE id = $1 AND collection_id = $2 AND deleted_at IS NULL
      LIMIT 1
    `,
    commentId,
    row.id,
  )) as Array<{ authorId: number }>;
  const comment = comments[0];
  if (!comment) throw new NotFoundError("Comment not found");
  if (comment.authorId !== actor.id && !(await canManageCollection(row, actor))) {
    throw new ForbiddenError("Not allowed");
  }
  await db.$executeRawUnsafe(
    `UPDATE "CollectionComment" SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    commentId,
  );
  return { ok: true };
}

export async function followCollection({
  collectionId,
  actor,
  follow,
}: {
  collectionId: CollectionIdentifier;
  actor: CollectionActor;
  follow: boolean;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  if (follow) {
    const existing = (await db.$queryRawUnsafe(
      `
        SELECT 1
        FROM "CollectionFollow"
        WHERE collection_id = $1 AND user_id = $2
        LIMIT 1
      `,
      row.id,
      actor.id,
    ).catch(() => [])) as Array<Record<string, unknown>>;
    await db.$executeRawUnsafe(
      `
        INSERT INTO "CollectionFollow" (collection_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (collection_id, user_id) DO NOTHING
      `,
      row.id,
      actor.id,
    );
    if (row.ownerId !== actor.id && existing.length === 0) {
      await db.notification.create({
        data: {
          recipientId: row.ownerId,
          actorId: actor.id,
          type: "GENERAL",
          title: `${actor.slug} followed your collection`,
          body: row.title,
          link: `/c/${row.slug}`,
          data: { kind: "collection_follow", collectionId: row.id },
        },
      });
    }
  } else {
    await db.$executeRawUnsafe(
      `DELETE FROM "CollectionFollow" WHERE collection_id = $1 AND user_id = $2`,
      row.id,
      actor.id,
    );
  }
  return { ok: true, following: follow };
}

export async function exportCollection({
  collectionId,
  actor,
}: {
  collectionId: CollectionIdentifier;
  actor?: CollectionActor | null;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  return {
    format: "jamcore.collection.v1",
    exportedAt: new Date().toISOString(),
    collection: await presentCollection(row),
  };
}

export async function importCollection({
  actor,
  input,
  tenantId,
}: {
  actor: CollectionActor;
  input: z.infer<typeof collectionImportSchema>;
  tenantId?: string | null;
}) {
  const errors: Array<{ index: number; itemType: string; itemId: number; message: string }> = [];
  for (const [index, item] of input.items.entries()) {
    const normalizedItemId =
      item.itemType === "youtube_track"
        ? stablePositiveHash(canonicalExternalKey(item))
        : item.itemId;
    try {
      if (!normalizedItemId) throw new BadRequestError("Item ID is required");
      await assertItemVisible(item.itemType, normalizedItemId, tenantId);
    } catch (error) {
      errors.push({
        index,
        itemType: item.itemType,
        itemId: normalizedItemId ?? 0,
        message: error instanceof Error ? error.message : "Invalid item",
      });
    }
  }
  if (errors.length > 0) {
    throw new BadRequestError("Collection import contains unavailable items", { itemErrors: errors });
  }

  const collection = await createCollection({
    actor,
    tenantId,
    input: {
      title: input.title ?? input.sourceName ?? "Imported collection",
      description: input.description ?? null,
      collectionType: "music",
      visibility: input.visibility,
      playbackMode: input.playbackMode,
    },
  });
  for (const item of input.items) {
    await addCollectionItem({
      collectionId: collection.id,
      actor,
      input: item,
      tenantId,
    });
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "CollectionImport"
      (collection_id, imported_by, source_name)
      VALUES ($1, $2, $3)
    `,
    collection.id,
    actor.id,
    input.sourceName ?? null,
  );
  return getCollection({ collectionId: collection.id, actor });
}
