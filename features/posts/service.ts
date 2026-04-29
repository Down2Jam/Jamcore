import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import {
  cleanupNotificationsForPost,
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "../comments/thread.service.js";
import { emitDomainEvent } from "../../lib/domainEvents.js";
import { invalidatePublicReadCaches } from "../../lib/cacheInvalidation.js";
import {
  assignCoreEntityTenant,
  filterCoreEntityIdsByTenant,
} from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { writeAuditEntry } from "../../infra/audit.js";
import { enqueueSearchEntityIndex } from "../search/indexing.service.js";
import { hasResourceGrant } from "../../lib/resourceAuthorization.js";
import { assertPostBelongsToTenant } from "../../lib/contentTenant.js";
import { notifyNewMentions } from "../mentions/notifications.service.js";
import {
  publishPostCreated,
  publishPostUpdated,
} from "../federation/index.js";
import {
  decodeFeedCursor,
  getRemoteFeedCursorFromItem,
  listRemoteCommentsForTarget,
  listRemoteFeedPosts,
} from "../federation/remote-content.service.js";
import { notifyFollowers } from "../social/index.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../lib/errors.js";
import type { PostTime } from "../../types/PostTimes.js";

const POST_TIME_VALUES = [
  "hour",
  "three_hours",
  "six_hours",
  "twelve_hours",
  "day",
  "week",
  "month",
  "three_months",
  "six_months",
  "nine_months",
  "year",
  "all",
] as const satisfies readonly PostTime[];

const POST_TIME_HOURS: Record<PostTime, number> = {
  hour: 1,
  three_hours: 3,
  six_hours: 6,
  twelve_hours: 12,
  day: 24,
  week: 7 * 24,
  month: 30 * 24,
  three_months: 3 * 30 * 24,
  six_months: 6 * 30 * 24,
  nine_months: 9 * 30 * 24,
  year: 365 * 24,
  all: 0,
};

type ViewerContext = {
  userId: number | null;
  privilegedViewer: boolean;
};

type PostActor = {
  id: number;
  name: string;
  slug: string;
  mod?: boolean | null;
  admin?: boolean | null;
};

type ReactionSummaryEntry = {
  reaction: any;
  userId: number;
  reactionId: number;
  createdAt?: Date;
  user?: { id: number; slug: string; name: string; profilePicture?: string | null };
};

const postInclude = {
  author: true,
  tags: true,
  likes: true,
  postReactions: {
    include: {
      reaction: true,
      user: {
        select: {
          id: true,
          slug: true,
          name: true,
          profilePicture: true,
        },
      },
    },
  },
  comments: {
    include: {
      author: true,
      likes: true,
      commentReactions: {
        include: {
          reaction: true,
          user: {
            select: {
              id: true,
              slug: true,
              name: true,
              profilePicture: true,
            },
          },
        },
      },
      children: {
        include: {
          author: true,
          likes: true,
          commentReactions: {
            include: {
              reaction: true,
              user: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  profilePicture: true,
                },
              },
            },
          },
          children: {
            include: {
              author: true,
              likes: true,
              commentReactions: {
                include: {
                  reaction: true,
                  user: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      profilePicture: true,
                    },
                  },
                },
              },
              children: true,
            },
          },
        },
      },
    },
  },
} as const;

export const createPostSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.number().int().positive()).optional(),
  sticky: z.boolean().optional().default(false),
  draftStatus: z.enum(["draft", "scheduled", "published"]).optional().default("published"),
  scheduledPublishAt: z.string().datetime().optional().nullable(),
  generatePreviewToken: z.boolean().optional().default(false),
  gameLinks: z.array(z.object({
    gameId: z.coerce.number().int().positive(),
    relationType: z.enum(["devlog", "release", "postmortem", "announcement", "other"]).optional().default("devlog"),
  })).optional(),
  collaboratorSlugs: z.array(z.string().trim().min(1)).optional(),
});

export const updatePostSchema = z
  .object({
    postId: z.coerce.number().int().positive(),
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    tags: z.array(z.number().int().positive()).optional(),
    sticky: z.boolean().optional(),
    draftStatus: z.enum(["draft", "scheduled", "published"]).optional(),
    scheduledPublishAt: z.string().datetime().optional().nullable(),
    rotatePreviewToken: z.boolean().optional(),
    gameLinks: z.array(z.object({
      gameId: z.coerce.number().int().positive(),
      relationType: z.enum(["devlog", "release", "postmortem", "announcement", "other"]).optional().default("devlog"),
    })).optional(),
    collaboratorSlugs: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.content !== undefined ||
      payload.tags !== undefined ||
      payload.sticky !== undefined ||
      payload.draftStatus !== undefined ||
      payload.scheduledPublishAt !== undefined ||
      payload.rotatePreviewToken !== undefined ||
      payload.gameLinks !== undefined ||
      payload.collaboratorSlugs !== undefined,
    {
      message: "No update fields provided.",
    },
  );

export const deletePostSchema = z.object({
  postId: z.coerce.number().int().positive(),
  mode: z.enum(["delete", "remove"]).optional().default("delete"),
});

export const getPostQuerySchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    slug: z.string().trim().min(1).optional(),
    user: z.string().trim().min(1).optional(),
    previewToken: z.string().trim().min(16).optional(),
  })
  .refine((payload) => payload.id !== undefined || payload.slug !== undefined, {
    message: "Post id or slug required.",
  });

export const listPostsQuerySchema = z.object({
  sort: z.enum(["oldest", "newest", "top"]).optional().default("newest"),
  time: z.enum(POST_TIME_VALUES).optional().default("all"),
  user: z.string().trim().min(1).optional(),
  tags: z.string().optional(),
  sticky: z.union([z.literal("true"), z.literal("false")]).optional(),
  following: z.union([z.literal("true"), z.literal("false")]).optional(),
  cursor: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const publishPostSchema = z.object({
  postId: z.coerce.number().int().positive(),
});

export const createPostSeriesSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  visibility: z.enum(["private", "unlisted", "public"]).optional().default("public"),
});

export const updatePostSeriesSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    visibility: z.enum(["private", "unlisted", "public"]).optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.description !== undefined ||
      payload.visibility !== undefined,
    { message: "No update fields provided." },
  );

export const listPostSeriesQuerySchema = z.object({
  mine: z.union([z.literal("true"), z.literal("false")]).optional(),
  user: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().datetime().optional(),
});

export const postSeriesPostSchema = z.object({
  postId: z.coerce.number().int().positive(),
  position: z.coerce.number().int().optional().default(0),
});

type PostPublicationMeta = {
  draftStatus: "draft" | "scheduled" | "published" | "pending_review";
  scheduledPublishAt: Date | null;
  previewToken: string | null;
};

function buildReactionSummary(
  reactions: ReactionSummaryEntry[],
  userId: number | null,
) {
  const summaryMap = new Map<
    number,
    {
      reaction: any;
      count: number;
      reacted: boolean;
      firstReactionAt: Date | null;
      firstReactorUserId: number | null;
      users: Array<{
        id: number;
        slug: string;
        name: string;
        profilePicture?: string | null;
      }>;
    }
  >();

  for (const entry of reactions) {
    const current = summaryMap.get(entry.reactionId) ?? {
      reaction: entry.reaction,
      count: 0,
      reacted: false,
      firstReactionAt: null,
      firstReactorUserId: null,
      users: [],
    };
    current.count += 1;
    if (userId && entry.userId === userId) {
      current.reacted = true;
    }
    if (
      !current.firstReactionAt ||
      (entry.createdAt && entry.createdAt < current.firstReactionAt)
    ) {
      current.firstReactionAt = entry.createdAt ?? null;
      current.firstReactorUserId = entry.userId;
    }
    if (entry.user) {
      current.users.push(entry.user);
    }
    summaryMap.set(entry.reactionId, current);
  }

  return Array.from(summaryMap.values())
    .map((summary) => ({
      reaction: summary.reaction,
      count: summary.count,
      reacted: summary.reacted,
      isFirstReactor: Boolean(userId) && summary.firstReactorUserId === userId,
      users: summary.users
        .filter(
          (user, index, self) =>
            self.findIndex((candidate) => candidate.id === user.id) === index,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.reaction.slug.localeCompare(b.reaction.slug);
    });
}

async function resolveViewerContext(userSlug?: string): Promise<ViewerContext> {
  if (!userSlug) {
    return {
      userId: null,
      privilegedViewer: false,
    };
  }

  const userRecord = await db.user.findUnique({
    where: { slug: userSlug },
  });

  return {
    userId: userRecord?.id ?? null,
    privilegedViewer: isPrivilegedViewer(userRecord),
  };
}

function presentPost(post: any, viewer: ViewerContext) {
  return {
    ...post,
    comments: mapCommentsForViewer(
      post.comments,
      viewer.userId,
      viewer.privilegedViewer,
    ),
    hasLiked: viewer.userId
      ? post.likes.some((like: { userId: number }) => like.userId === viewer.userId)
      : false,
    reactions: buildReactionSummary(post.postReactions ?? [], viewer.userId),
  };
}

function parseTagFilter(tags?: string) {
  if (!tags) {
    return {};
  }

  const splitTags = tags.split("_");
  const splitSplitTags = splitTags.map((tag) => ({
    id: tag.split(",")[0],
    value: tag.split(",")[1],
  }));

  const includeTags = splitSplitTags
    .filter((tag) => tag.value === "1")
    .map((tag) => parseInt(tag.id, 10));

  const excludeTags = splitSplitTags
    .filter((tag) => tag.value === "-1")
    .map((tag) => parseInt(tag.id, 10));

  if (!includeTags.length && !excludeTags.length) {
    return {};
  }

  return {
    tags: {
      ...(includeTags.length > 0 ? { some: { id: { in: includeTags } } } : {}),
      ...(excludeTags.length > 0 ? { none: { id: { in: excludeTags } } } : {}),
    },
  };
}

function buildTimeWhere(time: PostTime) {
  if (time === "all") {
    return {};
  }

  const hours = POST_TIME_HOURS[time];

  return {
    createdAt: {
      gte: new Date(Date.now() - hours * 60 * 60 * 1000),
    },
  };
}

async function assertAllowedModeratorTags(
  tagIds: number[] | undefined,
  actor: PostActor,
) {
  if (!tagIds?.length) {
    return;
  }

  const modTags = await db.tag.findMany({
    where: {
      id: { in: tagIds },
      modOnly: true,
    },
  });

  if (modTags.length > 0 && !actor.mod) {
    throw new ForbiddenError("Insufficient permissions to use moderator tags.");
  }
}

async function buildUniquePostSlug(title: string) {
  const slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slugBase) {
    throw new BadRequestError("Unable to generate post slug from title.");
  }

  let slug = slugBase;
  let count = 1;

  while (true) {
    const existingPost = await db.post.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existingPost) {
      return slug;
    }

    count += 1;
    slug = `${slugBase}-${count}`;
  }
}

async function buildUniquePostSeriesSlug(ownerId: number, title: string, tenantId?: string | null) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "series";
  let slug = base;
  let suffix = 1;
  while (true) {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "PostSeries"
        WHERE owner_id = $1 AND slug = $2 AND tenant_id IS NOT DISTINCT FROM $3
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

function createPreviewToken() {
  return randomBytes(24).toString("base64url");
}

async function getPostPublicationMeta(postId: number): Promise<PostPublicationMeta> {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT
        draft_status AS "draftStatus",
        scheduled_publish_at AS "scheduledPublishAt",
        preview_token AS "previewToken"
      FROM "Post"
      WHERE id = $1
      LIMIT 1
    `,
    postId,
  )) as PostPublicationMeta[];

  return rows[0] ?? {
    draftStatus: "published",
    scheduledPublishAt: null,
    previewToken: null,
  };
}

function isPostPublic(meta: PostPublicationMeta) {
  return (
    meta.draftStatus === "published" ||
    (meta.draftStatus === "scheduled" &&
      meta.scheduledPublishAt != null &&
      meta.scheduledPublishAt.getTime() <= Date.now())
  );
}

async function filterPublishedPostIds(ids: number[]) {
  if (ids.length === 0) {
    return [];
  }

  const rows = (await db.$queryRawUnsafe(
    `
      SELECT id
      FROM "Post"
      WHERE id = ANY($1::int[])
        AND (
          draft_status = 'published'
          OR (draft_status = 'scheduled' AND scheduled_publish_at <= NOW())
        )
    `,
    ids,
  )) as Array<{ id: number }>;

  return rows.map((row) => row.id);
}

async function shouldRequirePostReview(actor: PostActor, tenantId?: string | null) {
  if (actor.mod || actor.admin) return false;
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT require_post_review AS "requirePostReview",
        review_first_posts_only AS "reviewFirstPostsOnly"
      FROM "ContentReviewSettings"
      WHERE tenant_id = $1
      LIMIT 1
    `,
    tenantId ?? "default",
  ).catch(() => [])) as Array<{ requirePostReview: boolean; reviewFirstPostsOnly: boolean }>;
  const settings = rows[0];
  if (!settings?.requirePostReview) return false;
  if (!settings.reviewFirstPostsOnly) return true;
  const previousPublished = await db.post.count({
    where: {
      authorId: actor.id,
      deletedAt: null,
      removedAt: null,
    },
  });
  return previousPublished === 0;
}

async function syncPostGames({
  postId,
  gameLinks,
  tenantId,
}: {
  postId: number;
  gameLinks?: Array<{ gameId: number; relationType?: "devlog" | "release" | "postmortem" | "announcement" | "other" }>;
  tenantId?: string | null;
}) {
  if (!gameLinks) return;
  const unique = Array.from(new Map(gameLinks.map((link) => [link.gameId, link])).values());
  const allowed = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: unique.map((link) => link.gameId),
    tenantId,
  });
  if (allowed.length !== unique.length) {
    throw new NotFoundError("Linked game not found");
  }
  await db.$executeRawUnsafe(`DELETE FROM "PostGameLink" WHERE post_id = $1`, postId);
  for (const link of unique) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO "PostGameLink" (post_id, game_id, relation_type)
        VALUES ($1, $2, $3)
      `,
      postId,
      link.gameId,
      link.relationType ?? "devlog",
    );
  }
}

async function syncPostCollaborators({
  postId,
  actor,
  collaboratorSlugs,
}: {
  postId: number;
  actor: PostActor;
  collaboratorSlugs?: string[];
}) {
  if (!collaboratorSlugs) return;
  const slugs = [...new Set(collaboratorSlugs.filter((slug) => slug !== actor.slug))];
  const users = slugs.length
    ? await db.user.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })
    : [];
  if (users.length !== slugs.length) {
    throw new NotFoundError("Collaborator not found");
  }
  await db.$executeRawUnsafe(`DELETE FROM "PostCollaborator" WHERE post_id = $1`, postId);
  for (const user of users) {
    await db.$executeRawUnsafe(
      `
        INSERT INTO "PostCollaborator"
        (post_id, user_id, role, status, invited_by)
        VALUES ($1, $2, 'coauthor', 'accepted', $3)
      `,
      postId,
      user.id,
      actor.id,
    );
  }
}

async function getFollowingUserIds(userId: number, tenantId?: string | null) {
  const rows = await db.userFollow.findMany({
    where: {
      followerId: userId,
      tenantId: tenantId ?? null,
    },
    select: { followingId: true },
  });
  return rows.map((row) => row.followingId);
}

async function getPostExtras(postId: number) {
  const [games, collaborators] = await Promise.all([
    db.$queryRawUnsafe(
      `
        SELECT pg.game_id AS "gameId", pg.relation_type AS "relationType", g.slug, gp.name
        FROM "PostGameLink" pg
        JOIN "Game" g ON g.id = pg.game_id
        LEFT JOIN "GamePage" gp ON gp."gameId" = g.id AND gp.version = 'POST_JAM'
        WHERE pg.post_id = $1
        ORDER BY pg.created_at ASC
      `,
      postId,
    ).catch(() => []),
    db.$queryRawUnsafe(
      `
        SELECT pc.user_id AS "userId", pc.role, pc.status, u.slug, u.name
        FROM "PostCollaborator" pc
        JOIN "User" u ON u.id = pc.user_id
        WHERE pc.post_id = $1 AND pc.status = 'accepted'
        ORDER BY pc.created_at ASC
      `,
      postId,
    ).catch(() => []),
  ]);
  return { games, collaborators };
}

async function updatePostPublicationMeta({
  postId,
  draftStatus,
  scheduledPublishAt,
  rotatePreviewToken,
}: {
  postId: number;
  draftStatus?: "draft" | "scheduled" | "published" | "pending_review";
  scheduledPublishAt?: string | null;
  rotatePreviewToken?: boolean;
}) {
  if (
    draftStatus === undefined &&
    scheduledPublishAt === undefined &&
    rotatePreviewToken !== true
  ) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "Post"
      SET
        draft_status = COALESCE($2, draft_status),
        scheduled_publish_at = CASE
          WHEN $3::boolean THEN $4::timestamptz
          ELSE scheduled_publish_at
        END,
        preview_token = CASE
          WHEN $5::boolean THEN $6
          ELSE preview_token
        END
      WHERE id = $1
    `,
    postId,
    draftStatus ?? null,
    scheduledPublishAt !== undefined,
    scheduledPublishAt ?? null,
    rotatePreviewToken === true,
    rotatePreviewToken ? createPreviewToken() : null,
  );
}

async function recordPostRevision({
  post,
  editorId,
}: {
  post: { id: number; title: string; content: string; sticky: boolean };
  editorId?: number | null;
}) {
  await db.$executeRawUnsafe(
    `
      INSERT INTO "PostRevision"
      (id, post_id, editor_id, title, content, sticky)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    randomUUID(),
    post.id,
    editorId ?? null,
    post.title,
    post.content,
    post.sticky,
  );
}

export async function createPost({
  actor,
  input,
  tenantId,
}: {
  actor: PostActor | null | undefined;
  input: z.infer<typeof createPostSchema>;
  tenantId?: string;
}) {
  if (!actor) {
    throw new UnauthorizedError("User missing");
  }

  await assertAllowedModeratorTags(input.tags, actor);
  const slug = await buildUniquePostSlug(input.title);

  const newPost = await db.post.create({
    data: {
      title: input.title,
      slug,
      sticky: input.sticky,
      content: input.content,
      authorId: actor.id,
    },
  });
  if (tenantId) {
    await assignCoreEntityTenant({
      entityType: "Post",
      entityId: newPost.id,
      tenantId,
    });
  }

  const requestedStatus =
    input.draftStatus === "published" && (await shouldRequirePostReview(actor, tenantId))
      ? "pending_review"
      : input.draftStatus;

  await updatePostPublicationMeta({
    postId: newPost.id,
    draftStatus: requestedStatus,
    scheduledPublishAt:
      requestedStatus === "scheduled"
        ? input.scheduledPublishAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : input.scheduledPublishAt ?? null,
    rotatePreviewToken: input.generatePreviewToken || requestedStatus !== "published",
  });

  await syncPostGames({ postId: newPost.id, gameLinks: input.gameLinks, tenantId });
  await syncPostCollaborators({ postId: newPost.id, actor, collaboratorSlugs: input.collaboratorSlugs });

  await db.like.create({
    data: {
      userId: actor.id,
      postId: newPost.id,
    },
  });

  if (input.tags?.length) {
    await db.post.update({
      where: { id: newPost.id },
      data: {
        tags: {
          connect: input.tags.map((tagId) => ({ id: tagId })),
        },
      },
    });
  }

  if (requestedStatus === "published") {
    await notifyNewMentions({
      type: "post",
      actorId: actor.id,
      actorName: actor.name,
      actorSlug: actor.slug,
      beforeContent: "",
      afterContent: input.content,
      postId: newPost.id,
      postSlug: newPost.slug ?? slug,
      postTitle: newPost.title ?? input.title,
    });

    await publishPostCreated(newPost.id);
    await notifyFollowers({
      authorId: actor.id,
      tenantId,
      type: "GENERAL",
      title: `${actor.name} published a post`,
      body: newPost.title,
      link: `/forum/posts/${newPost.slug ?? newPost.id}`,
      data: { kind: "post", postId: newPost.id },
    });
  }
  await writeAuditEntry({
    action: "post.create",
    actor: {
      id: actor.id,
      slug: actor.slug,
      type: "user",
    },
    resource: `post:${newPost.id}`,
    metadata: {
      sticky: input.sticky,
    },
  });
  await emitDomainEvent({
    type: "post.created",
    payload: {
      actorId: actor.id,
      postId: newPost.id,
      postSlug: slug,
    },
  });
  if (requestedStatus === "published") {
    await enqueueSearchEntityIndex({
      entityType: "post",
      entityId: newPost.id,
      tenantId,
    });
  }
  invalidatePublicReadCaches("content");
  return newPost;
}

export async function updatePost({
  actor,
  input,
  grants,
  tenantId,
}: {
  actor: PostActor | null | undefined;
  input: z.infer<typeof updatePostSchema>;
  grants?: Array<{
    role: string;
    resourceType?: string | null;
    resourceId?: string | null;
  }>;
  tenantId?: string | null;
}) {
  if (!actor) {
    throw new UnauthorizedError("User missing");
  }

  const post = await db.post.findUnique({
    where: { id: input.postId },
  });

  if (!post) {
    throw new NotFoundError("Post not found");
  }

  if (post.deletedAt || post.removedAt) {
    throw new BadRequestError("Cannot edit a deleted or removed post.");
  }

  await assertPostBelongsToTenant(post.id, tenantId);

  const isAuthor = post.authorId === actor.id;
  const isModerator = actor.mod === true;
  const canManageViaGrant = hasResourceGrant({
    grants,
    resourceType: "post",
    resourceId: input.postId,
  });

  if (!isAuthor && !isModerator && !canManageViaGrant) {
    throw new ForbiddenError("You do not have permission to edit this post.");
  }

  await assertAllowedModeratorTags(input.tags, actor);

  const data: {
    title?: string;
    content?: string;
    sticky?: boolean;
    editedAt?: Date;
    tags?: { set: Array<{ id: number }> };
  } = {};
  let shouldMarkEdited = false;

  if (typeof input.title === "string") {
    data.title = input.title;
    if (input.title !== post.title) shouldMarkEdited = true;
  }

  if (typeof input.content === "string") {
    data.content = input.content;
    if (input.content !== post.content) shouldMarkEdited = true;
  }

  if (typeof input.sticky === "boolean") {
    data.sticky = input.sticky;
  }

  if (Array.isArray(input.tags)) {
    data.tags = { set: input.tags.map((tagId) => ({ id: tagId })) };
    shouldMarkEdited = true;
  }

  if (shouldMarkEdited) {
    data.editedAt = new Date();
  }

  const requestedStatus =
    input.draftStatus === "published" && (await shouldRequirePostReview(actor, tenantId))
      ? "pending_review"
      : input.draftStatus;

  if (
    shouldMarkEdited ||
    requestedStatus !== undefined ||
    input.scheduledPublishAt !== undefined
  ) {
    await recordPostRevision({ post, editorId: actor.id });
  }

  const updatedPost = await db.post.update({
    where: { id: input.postId },
    data,
    include: { tags: true },
  });

  await updatePostPublicationMeta({
    postId: input.postId,
    draftStatus: requestedStatus,
    scheduledPublishAt: input.scheduledPublishAt,
    rotatePreviewToken: input.rotatePreviewToken,
  });

  await syncPostGames({ postId: input.postId, gameLinks: input.gameLinks, tenantId });
  await syncPostCollaborators({
    postId: input.postId,
    actor,
    collaboratorSlugs: input.collaboratorSlugs,
  });

  const publicationMeta = await getPostPublicationMeta(updatedPost.id);
  if (isPostPublic(publicationMeta)) {
    await notifyNewMentions({
      type: "post",
      actorId: actor.id,
      actorName: actor.name,
      actorSlug: actor.slug,
      beforeContent: post.content,
      afterContent:
        typeof input.content === "string" ? input.content : post.content,
      postId: updatedPost.id,
      postSlug: updatedPost.slug ?? post.slug ?? `post-${updatedPost.id}`,
      postTitle: updatedPost.title ?? post.title ?? "Untitled post",
    });

    await publishPostUpdated(updatedPost.id);
  }
  await writeAuditEntry({
    action: "post.update",
    actor: {
      id: actor.id,
      slug: actor.slug,
      type: "user",
    },
    resource: `post:${updatedPost.id}`,
  });
  await emitDomainEvent({
    type: "post.updated",
    payload: {
      actorId: actor.id,
      postId: updatedPost.id,
    },
  });
  if (isPostPublic(publicationMeta)) {
    await enqueueSearchEntityIndex({
      entityType: "post",
      entityId: updatedPost.id,
    });
  }
  invalidatePublicReadCaches("content");
  return updatedPost;
}

export async function deletePost({
  actor,
  input,
  grants,
  tenantId,
}: {
  actor: PostActor | null | undefined;
  input: z.infer<typeof deletePostSchema>;
  grants?: Array<{
    role: string;
    resourceType?: string | null;
    resourceId?: string | null;
  }>;
  tenantId?: string | null;
}) {
  if (!actor) {
    throw new UnauthorizedError("User missing");
  }

  const post = await db.post.findUnique({
    where: { id: input.postId },
  });

  if (!post) {
    throw new NotFoundError("Post not found");
  }

  await assertPostBelongsToTenant(post.id, tenantId);

  const isAuthor = post.authorId === actor.id;
  const isModerator = actor.mod === true || actor.admin === true;
  const canManageViaGrant = hasResourceGrant({
    grants,
    resourceType: "post",
    resourceId: input.postId,
  });
  const isRemoval = input.mode === "remove";

  if (!isAuthor && !isModerator && !canManageViaGrant) {
    throw new ForbiddenError("You do not have permission to delete this post.");
  }

  if (isRemoval && !isModerator) {
    throw new ForbiddenError("Only moderators can remove posts.");
  }

  await cleanupNotificationsForPost(input.postId);

  await db.post.update({
    where: { id: input.postId },
    data: {
      deletedAt: !isRemoval ? new Date() : post.deletedAt,
      removedAt: isRemoval ? new Date() : post.removedAt,
    },
  });

  await writeAuditEntry({
    action: input.mode === "remove" ? "post.remove" : "post.delete",
    actor: {
      id: actor.id,
      slug: actor.slug,
      type: "user",
    },
    resource: `post:${input.postId}`,
    metadata: {
      mode: input.mode,
    },
  });
  await emitDomainEvent({
    type: input.mode === "remove" ? "post.removed" : "post.deleted",
    payload: {
      actorId: actor.id,
      mode: input.mode,
      postId: input.postId,
    },
  });
  await enqueueSearchEntityIndex({
    entityType: "post",
    entityId: input.postId,
  });
  invalidatePublicReadCaches("content");

  return { mode: input.mode };
}

export async function loadPost(
  input: z.infer<typeof getPostQuerySchema>,
  tenantId?: string | null,
) {
  const viewer = await resolveViewerContext(input.user);

  const post = await db.post.findUnique({
    where: input.id ? { id: input.id } : { slug: input.slug! },
    include: postInclude,
  });

  if (!post) {
    throw new NotFoundError("Post missing.");
  }

  if ((post.deletedAt || post.removedAt) && !viewer.privilegedViewer) {
    throw new NotFoundError("Post missing.");
  }

  await assertPostBelongsToTenant(post.id, tenantId);

  const publicationMeta = await getPostPublicationMeta(post.id);
  const canPreview =
    Boolean(input.previewToken) &&
    publicationMeta.previewToken != null &&
    input.previewToken === publicationMeta.previewToken;
  if (
    !isPostPublic(publicationMeta) &&
    !viewer.privilegedViewer &&
    !canPreview &&
    viewer.userId !== post.authorId
  ) {
    throw new NotFoundError("Post missing.");
  }

  const presented = presentPost(post, viewer);
  return {
    ...presented,
    comments: [
      ...presented.comments,
      ...(await listRemoteCommentsForTarget({
        kind: "post",
        id: post.id,
        tenantId,
      })),
    ],
    ...(await getPostExtras(post.id)),
  };
}

export async function loadPostPreview(previewToken: string, tenantId?: string | null) {
  const rows = (await db.$queryRawUnsafe(
    `SELECT id FROM "Post" WHERE preview_token = $1 LIMIT 1`,
    previewToken,
  )) as Array<{ id: number }>;
  const postId = rows[0]?.id;
  if (!postId) {
    throw new NotFoundError("Post missing.");
  }
  return loadPost({ id: postId, previewToken }, tenantId);
}

export async function listPostRevisions({
  postId,
  actor,
  tenantId,
}: {
  postId: number;
  actor: PostActor;
  tenantId?: string | null;
}) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true },
  });
  if (!post) throw new NotFoundError("Post not found");
  await assertPostBelongsToTenant(post.id, tenantId);
  if (post.authorId !== actor.id && actor.mod !== true && actor.admin !== true) {
    throw new ForbiddenError("Not allowed");
  }

  return db.$queryRawUnsafe(
    `
      SELECT
        id,
        post_id AS "postId",
        editor_id AS "editorId",
        title,
        content,
        sticky,
        tags,
        created_at AS "createdAt"
      FROM "PostRevision"
      WHERE post_id = $1
      ORDER BY created_at DESC
    `,
    postId,
  );
}

export async function publishPost({
  actor,
  input,
  tenantId,
}: {
  actor: PostActor;
  input: z.infer<typeof publishPostSchema>;
  tenantId?: string | null;
}) {
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, authorId: true, title: true, content: true, slug: true, sticky: true },
  });
  if (!post) throw new NotFoundError("Post not found");
  await assertPostBelongsToTenant(post.id, tenantId);
  if (post.authorId !== actor.id && actor.mod !== true && actor.admin !== true) {
    throw new ForbiddenError("Not allowed");
  }

  await recordPostRevision({ post, editorId: actor.id });
  await updatePostPublicationMeta({
    postId: post.id,
    draftStatus: "published",
    scheduledPublishAt: null,
  });

  await notifyNewMentions({
    type: "post",
    actorId: actor.id,
    actorName: actor.name,
    actorSlug: actor.slug,
    beforeContent: "",
    afterContent: post.content,
    postId: post.id,
    postSlug: post.slug ?? `post-${post.id}`,
    postTitle: post.title,
  });
  await publishPostCreated(post.id);
  await notifyFollowers({
    authorId: post.authorId,
    tenantId,
    type: "GENERAL",
    title: `${actor.name} published a post`,
    body: post.title,
    link: `/forum/posts/${post.slug ?? post.id}`,
    data: { kind: "post", postId: post.id },
  });
  await enqueueSearchEntityIndex({
    entityType: "post",
    entityId: post.id,
    tenantId,
  });
  invalidatePublicReadCaches("content");
  return { ok: true };
}

export const contentReviewSettingsSchema = z.object({
  requirePostReview: z.boolean(),
  reviewFirstPostsOnly: z.boolean().optional().default(false),
});

export const reviewPostSchema = z.object({
  postId: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
});

export async function getContentReviewSettings(tenantId?: string | null) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT tenant_id AS "tenantId",
        require_post_review AS "requirePostReview",
        review_first_posts_only AS "reviewFirstPostsOnly",
        updated_by AS "updatedBy",
        updated_at AS "updatedAt"
      FROM "ContentReviewSettings"
      WHERE tenant_id = $1
      LIMIT 1
    `,
    tenantId ?? "default",
  ).catch(() => [])) as Array<Record<string, unknown>>;
  return rows[0] ?? {
    tenantId: tenantId ?? "default",
    requirePostReview: false,
    reviewFirstPostsOnly: false,
    updatedBy: null,
    updatedAt: null,
  };
}

export async function updateContentReviewSettings({
  input,
  actor,
  tenantId,
}: {
  input: z.infer<typeof contentReviewSettingsSchema>;
  actor: PostActor;
  tenantId?: string | null;
}) {
  await db.$executeRawUnsafe(
    `
      INSERT INTO "ContentReviewSettings"
        (tenant_id, require_post_review, review_first_posts_only, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        require_post_review = EXCLUDED.require_post_review,
        review_first_posts_only = EXCLUDED.review_first_posts_only,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `,
    tenantId ?? "default",
    input.requirePostReview,
    input.reviewFirstPostsOnly,
    actor.id,
  );
  return getContentReviewSettings(tenantId);
}

export async function listPendingReviewPosts(tenantId?: string | null) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT p.id, p.slug, p.title, p."createdAt", u.slug AS "authorSlug", u.name AS "authorName"
      FROM "Post" p
      JOIN "User" u ON u.id = p."authorId"
      WHERE p.draft_status = 'pending_review'
        AND p.tenant_id IS NOT DISTINCT FROM $1
      ORDER BY p."createdAt" ASC
    `,
    tenantId ?? null,
  ).catch(() => [])) as Array<Record<string, unknown>>;
  return rows;
}

export async function reviewPendingPost({
  input,
  actor,
  tenantId,
}: {
  input: z.infer<typeof reviewPostSchema>;
  actor: PostActor;
  tenantId?: string | null;
}) {
  if (!actor.mod && !actor.admin) throw new ForbiddenError("Not allowed");
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, authorId: true, title: true, content: true, slug: true, sticky: true },
  });
  if (!post) throw new NotFoundError("Post not found");
  await assertPostBelongsToTenant(post.id, tenantId);
  await recordPostRevision({ post, editorId: actor.id });
  await updatePostPublicationMeta({
    postId: post.id,
    draftStatus: input.decision === "approve" ? "published" : "draft",
    scheduledPublishAt: null,
  });
  if (input.decision === "approve") {
    await publishPostCreated(post.id);
    await notifyFollowers({
      authorId: post.authorId,
      tenantId,
      type: "GENERAL",
      title: "A followed author published a post",
      body: post.title,
      link: `/forum/posts/${post.slug ?? post.id}`,
      data: { kind: "post", postId: post.id, reviewApproved: true },
    });
    await enqueueSearchEntityIndex({ entityType: "post", entityId: post.id, tenantId });
  }
  await db.notification.create({
    data: {
      recipientId: post.authorId,
      actorId: actor.id,
      type: "GENERAL",
      title: `Your post was ${input.decision === "approve" ? "approved" : "sent back to drafts"}`,
      body: post.title,
      link: `/forum/posts/${post.slug ?? post.id}`,
      data: { kind: "post_review", postId: post.id, decision: input.decision },
    },
  });
  return { ok: true };
}

async function getPostSeriesRow(seriesId: string) {
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT s.id, s.tenant_id AS "tenantId", s.owner_id AS "ownerId",
        u.slug AS "ownerSlug", u.name AS "ownerName",
        s.slug, s.title, s.description, s.visibility,
        s.created_at AS "createdAt", s.updated_at AS "updatedAt"
      FROM "PostSeries" s
      JOIN "User" u ON u.id = s.owner_id
      WHERE s.id = $1
      LIMIT 1
    `,
    seriesId,
  ).catch(() => [])) as Array<Record<string, any>>;
  return rows[0] ?? null;
}

async function canViewPostSeries(series: Record<string, any>, actor?: PostActor | null) {
  return (
    series.visibility !== "private" ||
    actor?.id === series.ownerId ||
    actor?.mod === true ||
    actor?.admin === true
  );
}

async function presentPostSeries(series: Record<string, any>, includePosts = true) {
  const posts = includePosts
    ? await db.$queryRawUnsafe(
        `
          SELECT p.id, p.slug, p.title, p."createdAt",
            sp.position, sp.added_at AS "addedAt",
            u.slug AS "authorSlug", u.name AS "authorName"
          FROM "PostSeriesPost" sp
          JOIN "Post" p ON p.id = sp.post_id
          JOIN "User" u ON u.id = p."authorId"
          WHERE sp.series_id = $1
            AND p."deletedAt" IS NULL
            AND p."removedAt" IS NULL
            AND (p.draft_status = 'published' OR (p.draft_status = 'scheduled' AND p.scheduled_publish_at <= NOW()))
          ORDER BY sp.position ASC, sp.added_at ASC
        `,
        series.id,
      ).catch(() => [])
    : undefined;
  return {
    id: series.id,
    tenantId: series.tenantId,
    slug: series.slug,
    title: series.title,
    description: series.description,
    visibility: series.visibility,
    owner: {
      id: series.ownerId,
      slug: series.ownerSlug,
      name: series.ownerName,
    },
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
    posts,
  };
}

export async function createPostSeries({
  actor,
  input,
  tenantId,
}: {
  actor: PostActor;
  input: z.infer<typeof createPostSeriesSchema>;
  tenantId?: string | null;
}) {
  const id = randomUUID();
  const slug = await buildUniquePostSeriesSlug(actor.id, input.title, tenantId);
  await db.$executeRawUnsafe(
    `
      INSERT INTO "PostSeries"
      (id, tenant_id, owner_id, slug, title, description, visibility)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    id,
    tenantId ?? null,
    actor.id,
    slug,
    input.title,
    input.description ?? null,
    input.visibility,
  );
  const series = await getPostSeriesRow(id);
  return presentPostSeries(series);
}

export async function listPostSeries({
  actor,
  input,
  tenantId,
}: {
  actor?: PostActor | null;
  input: z.infer<typeof listPostSeriesQuerySchema>;
  tenantId?: string | null;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const rows = (await db.$queryRawUnsafe(
    `
      SELECT s.id, s.tenant_id AS "tenantId", s.owner_id AS "ownerId",
        u.slug AS "ownerSlug", u.name AS "ownerName",
        s.slug, s.title, s.description, s.visibility,
        s.created_at AS "createdAt", s.updated_at AS "updatedAt"
      FROM "PostSeries" s
      JOIN "User" u ON u.id = s.owner_id
      WHERE s.tenant_id IS NOT DISTINCT FROM $1
        AND ($2::boolean = false OR s.owner_id = $3)
        AND ($4::text IS NULL OR u.slug = $4)
        AND ($7::timestamptz IS NULL OR s.updated_at < $7::timestamptz)
        AND (
          s.visibility = 'public'
          OR (s.visibility = 'unlisted' AND $4::text IS NOT NULL)
          OR s.owner_id = $3
          OR $5::boolean = true
        )
      ORDER BY s.updated_at DESC
      LIMIT $6
    `,
    tenantId ?? null,
    input.mine === "true" && Boolean(actor),
    actor?.id ?? null,
    input.user ?? null,
    Boolean(actor?.mod || actor?.admin),
    limit,
    input.cursor ?? null,
  ).catch(() => [])) as Array<Record<string, any>>;
  return Promise.all(rows.map((row) => presentPostSeries(row, false)));
}

export async function getPostSeries({
  seriesId,
  actor,
}: {
  seriesId: string;
  actor?: PostActor | null;
}) {
  const series = await getPostSeriesRow(seriesId);
  if (!series || !(await canViewPostSeries(series, actor))) {
    throw new NotFoundError("Series not found");
  }
  return presentPostSeries(series);
}

export async function updatePostSeries({
  seriesId,
  actor,
  input,
}: {
  seriesId: string;
  actor: PostActor;
  input: z.infer<typeof updatePostSeriesSchema>;
}) {
  const series = await getPostSeriesRow(seriesId);
  if (!series) throw new NotFoundError("Series not found");
  if (series.ownerId !== actor.id && !actor.mod && !actor.admin) {
    throw new ForbiddenError("Not allowed");
  }
  await db.$executeRawUnsafe(
    `
      UPDATE "PostSeries"
      SET title = COALESCE($2, title),
        description = COALESCE($3, description),
        visibility = COALESCE($4, visibility),
        updated_at = NOW()
      WHERE id = $1
    `,
    seriesId,
    input.title ?? null,
    input.description ?? null,
    input.visibility ?? null,
  );
  return getPostSeries({ seriesId, actor });
}

export async function addPostToSeries({
  seriesId,
  actor,
  input,
  tenantId,
}: {
  seriesId: string;
  actor: PostActor;
  input: z.infer<typeof postSeriesPostSchema>;
  tenantId?: string | null;
}) {
  const series = await getPostSeriesRow(seriesId);
  if (!series) throw new NotFoundError("Series not found");
  if (series.ownerId !== actor.id && !actor.mod && !actor.admin) {
    throw new ForbiddenError("Not allowed");
  }
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, authorId: true, title: true, slug: true, deletedAt: true, removedAt: true },
  });
  if (!post || post.deletedAt || post.removedAt) throw new NotFoundError("Post not found");
  await assertPostBelongsToTenant(post.id, tenantId);
  if (post.authorId !== actor.id && !actor.mod && !actor.admin) {
    throw new ForbiddenError("Only the post author can add it to a series");
  }
  await db.$executeRawUnsafe(
    `
      INSERT INTO "PostSeriesPost" (series_id, post_id, position)
      VALUES ($1, $2, $3)
      ON CONFLICT (series_id, post_id)
      DO UPDATE SET position = EXCLUDED.position
    `,
    seriesId,
    input.postId,
    input.position,
  );
  await db.$executeRawUnsafe(`UPDATE "PostSeries" SET updated_at = NOW() WHERE id = $1`, seriesId);
  if (post.authorId !== actor.id) {
    await db.notification.create({
      data: {
        recipientId: post.authorId,
        actorId: actor.id,
        type: "GENERAL",
        title: `${actor.name} added your post to a series`,
        body: series.title,
        link: `/forum/posts/${post.slug ?? post.id}`,
        data: { kind: "post_series_add", postId: post.id, seriesId },
      },
    });
  }
  return getPostSeries({ seriesId, actor });
}

export async function removePostFromSeries({
  seriesId,
  postId,
  actor,
}: {
  seriesId: string;
  postId: number;
  actor: PostActor;
}) {
  const series = await getPostSeriesRow(seriesId);
  if (!series) throw new NotFoundError("Series not found");
  if (series.ownerId !== actor.id && !actor.mod && !actor.admin) {
    throw new ForbiddenError("Not allowed");
  }
  await db.$executeRawUnsafe(
    `DELETE FROM "PostSeriesPost" WHERE series_id = $1 AND post_id = $2`,
    seriesId,
    postId,
  );
  await db.$executeRawUnsafe(`UPDATE "PostSeries" SET updated_at = NOW() WHERE id = $1`, seriesId);
  return { ok: true };
}

export async function listPosts(
  input: z.infer<typeof listPostsQuerySchema>,
  tenantId?: string | null,
) {
  const viewer = await resolveViewerContext(input.user);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const feedCursor = decodeFeedCursor(input.cursor);
  const orderBy =
    input.sort === "oldest"
      ? { id: "asc" as const }
      : input.sort === "top"
        ? [{ likes: { _count: "desc" as const } }, { id: "desc" as const }]
        : { id: "desc" as const };

  const where = {
    ...buildTimeWhere(input.time),
    ...(feedCursor
      ? {
          createdAt:
            input.sort === "oldest"
              ? { gt: feedCursor }
              : { lt: feedCursor },
        }
      : {}),
    ...parseTagFilter(input.tags),
    ...(input.sticky === "true" ? { sticky: true } : {}),
    ...(input.following === "true" && viewer.userId
      ? {
          authorId: {
            in: await getFollowingUserIds(viewer.userId, tenantId),
          },
        }
      : {}),
    ...(viewer.privilegedViewer ? {} : { deletedAt: null, removedAt: null }),
  };

  const posts = await db.post.findMany({
    take: limit + 1,
    where,
    include: postInclude,
    orderBy,
    ...(input.cursor && /^\d+$/.test(input.cursor)
      ? {
          cursor: { id: Number.parseInt(input.cursor, 10) },
          skip: 1,
        }
      : {}),
  });

  const allowedIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Post",
      ids: posts.map((post) => post.id),
      tenantId,
    }),
  );
  const publicIds = new Set(await filterPublishedPostIds(posts.map((post) => post.id)));
  const visiblePosts = posts.filter((post) => allowedIds.has(post.id) && publicIds.has(post.id));
  const boostedPosts = visiblePosts;
  const localItems = boostedPosts.slice(0, limit + 1).map((post) => presentPost(post, viewer));
  const shouldIncludeRemoteFeed =
    (!input.cursor || Boolean(feedCursor)) &&
    input.sort !== "top" &&
    input.following !== "true" &&
    input.sticky !== "true" &&
    !input.tags;
  const remoteItems = shouldIncludeRemoteFeed
    ? await listRemoteFeedPosts({
        tenantId,
        limit: limit + 1,
        cursor: feedCursor,
        sort: input.sort === "oldest" ? "oldest" : "newest",
      })
    : [];
  const hasMore = boostedPosts.length > limit || remoteItems.length > limit;
  const items = [...localItems, ...remoteItems]
    .sort((a: any, b: any) => {
      if (input.sort === "top") {
        const aLikes = a.likes?.length ?? 0;
        const bLikes = b.likes?.length ?? 0;
        if (aLikes !== bLikes) return bLikes - aLikes;
      }

      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return input.sort === "oldest" ? aTime - bTime : bTime - aTime;
    })
    .slice(0, limit);
  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && items.length > 0
          ? input.sort === "top"
            ? String((items[items.length - 1] as { id: number } | undefined)?.id ?? "")
            : (getRemoteFeedCursorFromItem(items[items.length - 1]) ??
              String((localItems[localItems.length - 1] as { id: number } | undefined)?.id ?? ""))
          : null,
      limit,
    },
  };
}

