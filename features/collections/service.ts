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

type CollectionRow = {
  id: string;
  tenantId: string | null;
  forkedFromId?: string | null;
  ownerId: number;
  ownerSlug: string;
  ownerName: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: "private" | "unlisted" | "public";
  playbackMode?: "manual" | "shuffle" | "repeat";
  createdAt: Date;
  updatedAt: Date;
};

type CollectionItemRow = {
  id: string;
  collectionId: string;
  itemType: "game" | "post" | "track";
  itemId: number;
  note: string | null;
  position: number;
  addedAt: Date;
};

type CollectionCollaboratorRow = {
  id: string;
  collectionId: string;
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
  description: z.string().trim().max(1000).optional().nullable(),
  visibility: collectionVisibilitySchema.optional().default("private"),
  playbackMode: z.enum(["manual", "shuffle", "repeat"]).optional().default("manual"),
});

export const updateCollectionSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    visibility: collectionVisibilitySchema.optional(),
    playbackMode: z.enum(["manual", "shuffle", "repeat"]).optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.description !== undefined ||
      payload.visibility !== undefined ||
      payload.playbackMode !== undefined,
    { message: "No update fields provided." },
  );

export const collectionItemSchema = z.object({
  itemType: z.enum(["game", "post", "track"]),
  itemId: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).optional().nullable(),
  position: z.coerce.number().int().optional().default(0),
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
  itemType: z.enum(["game", "post", "track"]).optional(),
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

async function buildUniqueCollectionSlug(ownerId: number, title: string, tenantId?: string | null) {
  const base = slugify(title) || "collection";
  let slug = base;
  let suffix = 1;

  while (true) {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "Collection"
        WHERE owner_id = $1 AND slug = $2
          AND tenant_id IS NOT DISTINCT FROM $3
        LIMIT 1
      `,
      ownerId,
      slug,
      tenantId ?? null,
    )) as Array<{ id: string }>;
    if (rows.length === 0) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

async function getCollaborator(collectionId: string, userId?: number | null) {
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

async function getCollectionRow(id: string) {
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
        c.visibility,
        c.playback_mode AS "playbackMode",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM "Collection" c
      JOIN "User" u ON u.id = c.owner_id
      WHERE c.id = $1
      LIMIT 1
    `,
    id,
  )) as CollectionRow[];
  return rows[0] ?? null;
}

async function listCollectionItems(collectionId: string) {
  return (await db.$queryRawUnsafe(
    `
      SELECT
        id,
        collection_id AS "collectionId",
        item_type AS "itemType",
        item_id AS "itemId",
        note,
        position,
        added_at AS "addedAt"
      FROM "CollectionItem"
      WHERE collection_id = $1
      ORDER BY position ASC, added_at DESC
    `,
    collectionId,
  )) as CollectionItemRow[];
}

async function listCollectionCollaborators(collectionId: string) {
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

async function listCollectionComments(collectionId: string, input?: z.infer<typeof collectionCommentsQuerySchema>) {
  return db.$queryRawUnsafe(
    `
      SELECT
        c.id,
        c.collection_id AS "collectionId",
        c.author_id AS "authorId",
        u.slug AS "authorSlug",
        u.name AS "authorName",
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

async function countCollectionFollowers(collectionId: string) {
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

async function listCollectionNotificationRecipientIds(collectionId: string, actorId: number) {
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
      link: `/collections/${collection.id}`,
      data: {
        kind: "collection",
        collectionId: collection.id,
        ...data,
      },
    })),
  });
}

async function presentCollection(row: CollectionRow, includeItems = true) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    playbackMode: row.playbackMode ?? "manual",
    forkedFromId: row.forkedFromId ?? null,
    owner: {
      id: row.ownerId,
      slug: row.ownerSlug,
      name: row.ownerName,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: includeItems ? await listCollectionItems(row.id) : undefined,
    collaborators: includeItems ? await listCollectionCollaborators(row.id) : undefined,
    comments: includeItems ? await listCollectionComments(row.id) : undefined,
    followerCount: await countCollectionFollowers(row.id),
  };
}

async function assertItemVisible(itemType: "game" | "post" | "track", itemId: number, tenantId?: string | null) {
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
  const id = randomUUID();
  const slug = await buildUniqueCollectionSlug(actor.id, input.title, tenantId);
  await db.$executeRawUnsafe(
    `
      INSERT INTO "Collection"
      (id, tenant_id, owner_id, slug, title, description, visibility, playback_mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    id,
    tenantId ?? null,
    actor.id,
    slug,
    input.title,
    input.description ?? null,
    input.visibility,
    input.playbackMode,
  );

  const row = await getCollectionRow(id);
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
        AND ($9::text IS NULL OR EXISTS (
          SELECT 1 FROM "CollectionItem" typed_item
          WHERE typed_item.collection_id = c.id AND typed_item.item_type = $9
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
  )) as CollectionRow[];

  return Promise.all(rows.map((row) => presentCollection(row, false)));
}

export async function getCollection({
  collectionId,
  actor,
}: {
  collectionId: string;
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
  collectionId: string;
  actor: CollectionActor;
  input: z.infer<typeof updateCollectionSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");

  await db.$executeRawUnsafe(
    `
      UPDATE "Collection"
      SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        visibility = COALESCE($4, visibility),
        playback_mode = COALESCE($5, playback_mode),
        updated_at = NOW()
      WHERE id = $1
    `,
    collectionId,
    input.title ?? null,
    input.description ?? null,
    input.visibility ?? null,
    input.playbackMode ?? null,
  );

  const updated = await getCollectionRow(collectionId);
  if (!updated) throw new NotFoundError("Collection not found");
  return presentCollection(updated);
}

export async function forkCollection({
  collectionId,
  actor,
  tenantId,
}: {
  collectionId: string;
  actor: CollectionActor;
  tenantId?: string | null;
}) {
  const source = await getCollectionRow(collectionId);
  if (!source || !(await canViewCollection(source, actor))) {
    throw new NotFoundError("Collection not found");
  }

  const id = randomUUID();
  const title = `${source.title} fork`;
  const slug = await buildUniqueCollectionSlug(actor.id, title, tenantId);
  await db.$executeRawUnsafe(
    `
      INSERT INTO "Collection"
      (id, tenant_id, owner_id, slug, title, description, visibility, playback_mode, forked_from_id)
      VALUES ($1, $2, $3, $4, $5, $6, 'private', $7, $8)
    `,
    id,
    tenantId ?? null,
    actor.id,
    slug,
    title,
    source.description,
    source.playbackMode ?? "manual",
    source.id,
  );

  const items = await listCollectionItems(source.id);
  for (const item of items) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO "CollectionItem"
        (id, collection_id, item_type, item_id, note, position)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      randomUUID(),
      id,
      item.itemType,
      item.itemId,
      item.note,
      item.position,
    );
  }

  const row = await getCollectionRow(id);
  if (!row) throw new NotFoundError("Collection not found");
  if (source.ownerId !== actor.id) {
    await db.notification.create({
      data: {
        recipientId: source.ownerId,
        actorId: actor.id,
        type: "GENERAL",
        title: `${actor.slug} forked your collection`,
        body: source.title,
        link: `/collections/${source.id}`,
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
  collectionId: string;
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
    collectionId,
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
  collectionId: string;
  actor: CollectionActor;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  await db.$executeRawUnsafe(`DELETE FROM "Collection" WHERE id = $1`, collectionId);
  return { ok: true };
}

export async function addCollectionItem({
  collectionId,
  actor,
  input,
  tenantId,
}: {
  collectionId: string;
  actor: CollectionActor;
  input: z.infer<typeof collectionItemSchema>;
  tenantId?: string | null;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  await assertItemVisible(input.itemType, input.itemId, tenantId);

  await db.$executeRawUnsafe(
    `
      INSERT INTO "CollectionItem"
      (id, collection_id, item_type, item_id, note, position)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (collection_id, item_type, item_id)
      DO UPDATE SET note = EXCLUDED.note, position = EXCLUDED.position
    `,
    randomUUID(),
    collectionId,
    input.itemType,
    input.itemId,
    input.note ?? null,
    input.position,
  );
  await db.$executeRawUnsafe(
    `UPDATE "Collection" SET updated_at = NOW() WHERE id = $1`,
    collectionId,
  );
  return getCollection({ collectionId, actor });
}

export async function removeCollectionItem({
  collectionId,
  itemId,
  actor,
}: {
  collectionId: string;
  itemId: string;
  actor: CollectionActor;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row) throw new NotFoundError("Collection not found");
  if (!(await canManageCollection(row, actor))) throw new ForbiddenError("Not allowed");
  await db.$executeRawUnsafe(
    `DELETE FROM "CollectionItem" WHERE id = $1 AND collection_id = $2`,
    itemId,
    collectionId,
  );
  await db.$executeRawUnsafe(
    `UPDATE "Collection" SET updated_at = NOW() WHERE id = $1`,
    collectionId,
  );
  return { ok: true };
}

export async function inviteCollectionCollaborator({
  collectionId,
  actor,
  input,
}: {
  collectionId: string;
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
      (id, collection_id, user_id, role, status, invited_by)
      VALUES ($1, $2, $3, $4, 'pending', $5)
      ON CONFLICT (collection_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'pending', invited_by = EXCLUDED.invited_by, updated_at = NOW()
    `,
    randomUUID(),
    collectionId,
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
      link: `/collections/${collectionId}`,
      data: { kind: "collection_collaborator_invite", collectionId, role: input.role },
    },
  });
  return getCollection({ collectionId, actor });
}

export async function respondCollectionCollaboratorInvite({
  collectionId,
  actor,
  input,
}: {
  collectionId: string;
  actor: CollectionActor;
  input: z.infer<typeof respondCollectionCollaboratorSchema>;
}) {
  await db.$executeRawUnsafe(
    `
      UPDATE "CollectionCollaborator"
      SET status = $3, updated_at = NOW()
      WHERE collection_id = $1 AND user_id = $2
    `,
    collectionId,
    actor.id,
    input.status,
  );
  const row = await getCollectionRow(collectionId);
  if (row && row.ownerId !== actor.id) {
    await db.notification.create({
      data: {
        recipientId: row.ownerId,
        actorId: actor.id,
        type: "GENERAL",
        title: `${actor.slug} ${input.status} your collection invite`,
        body: row.title,
        link: `/collections/${collectionId}`,
        data: { kind: "collection_collaborator_response", collectionId, status: input.status },
      },
    });
  }
  return getCollection({ collectionId, actor });
}

export async function addCollectionComment({
  collectionId,
  actor,
  input,
}: {
  collectionId: string;
  actor: CollectionActor;
  input: z.infer<typeof collectionCommentSchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  const commentId = randomUUID();
  await db.$executeRawUnsafe(
    `
      INSERT INTO "CollectionComment"
      (id, collection_id, author_id, content)
      VALUES ($1, $2, $3, $4)
    `,
    commentId,
    collectionId,
    actor.id,
    input.content,
  );
  await notifyCollectionRecipients({
    collection: row,
    actor,
    title: `${actor.slug} commented on a collection`,
    body: row.title,
    data: { kind: "collection_comment", commentId },
  });
  return getCollection({ collectionId, actor });
}

export async function getCollectionComments({
  collectionId,
  actor,
  input,
}: {
  collectionId: string;
  actor?: CollectionActor | null;
  input: z.infer<typeof collectionCommentsQuerySchema>;
}) {
  const row = await getCollectionRow(collectionId);
  if (!row || !(await canViewCollection(row, actor))) {
    throw new NotFoundError("Collection not found");
  }
  const items = await listCollectionComments(collectionId, input);
  return { items };
}

export async function deleteCollectionComment({
  collectionId,
  commentId,
  actor,
}: {
  collectionId: string;
  commentId: string;
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
    collectionId,
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
  collectionId: string;
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
      collectionId,
      actor.id,
    ).catch(() => [])) as Array<Record<string, unknown>>;
    await db.$executeRawUnsafe(
      `
        INSERT INTO "CollectionFollow" (collection_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (collection_id, user_id) DO NOTHING
      `,
      collectionId,
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
          link: `/collections/${collectionId}`,
          data: { kind: "collection_follow", collectionId },
        },
      });
    }
  } else {
    await db.$executeRawUnsafe(
      `DELETE FROM "CollectionFollow" WHERE collection_id = $1 AND user_id = $2`,
      collectionId,
      actor.id,
    );
  }
  return { ok: true, following: follow };
}

export async function exportCollection({
  collectionId,
  actor,
}: {
  collectionId: string;
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
    try {
      await assertItemVisible(item.itemType, item.itemId, tenantId);
    } catch (error) {
      errors.push({
        index,
        itemType: item.itemType,
        itemId: item.itemId,
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
      (id, collection_id, imported_by, source_name)
      VALUES ($1, $2, $3, $4)
    `,
    randomUUID(),
    collection.id,
    actor.id,
    input.sourceName ?? null,
  );
  return getCollection({ collectionId: collection.id, actor });
}
