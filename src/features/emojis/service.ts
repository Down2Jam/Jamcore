import { z } from "zod";

import type { Prisma } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { getJamPage } from "../games/page.helpers.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

const userSummarySelect = {
  id: true,
  slug: true,
  name: true,
  profilePicture: true,
} as const;

const emojiInclude = {
  artistUser: {
    select: userSummarySelect,
  },
  ownerUser: {
    select: userSummarySelect,
  },
  uploaderUser: {
    select: userSummarySelect,
  },
  ownerGame: {
    select: {
      id: true,
      slug: true,
      pages: {
        where: { version: "JAM" },
        select: { name: true, thumbnail: true },
        take: 1,
      },
    },
  },
} as const;

const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;

const emojiInputSchemaBase = {
  slug: z.string().trim().min(1),
  image: z.string().trim().min(1),
  artist: z.string().trim().optional(),
  artistSlug: z.string().trim().optional(),
  artistId: z.coerce.number().int().positive().optional(),
} as const;

const nullableId = z.preprocess((value) => {
  if (value === "" || value === null) {
    return null;
  }

  return value;
}, z.coerce.number().int().positive().nullable());

export const createEmojiSchema = z.object(emojiInputSchemaBase);

export const updateEmojiParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateEmojiSchema = z.object({
  slug: z.string().trim().min(1).optional(),
  image: z.string().trim().min(1).optional(),
  artist: z.string().trim().nullable().optional(),
  artistSlug: z.string().trim().nullable().optional(),
  artistId: nullableId.optional(),
  scopeUserId: nullableId.optional(),
  scopeGameId: nullableId.optional(),
});

export const gameEmojiParamsSchema = z.object({
  gameSlug: z.string().trim().min(1),
});

export const deleteEmojiParamsSchema = updateEmojiParamsSchema;

type EmojiRecord = Prisma.ReactionGetPayload<{
  include: typeof emojiInclude;
}>;

type EmojiActor = {
  id: number;
  admin?: boolean | null;
};

type EditableEmoji = {
  id: number;
  slug: string;
  image: string;
  artist: string | null;
  artistId: number | null;
  scopeType: "GLOBAL" | "USER" | "GAME";
  scopeUserId: number | null;
  scopeGameId: number | null;
  ownerGame:
    | {
        team: {
          users: Array<{ id: number }>;
        };
      }
    | null;
};

function sanitizeSlug(value: string, maxLength = 50) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, maxLength);
}

function generatePrefix(seed?: string | null): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const normalizedSeed = (seed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (
    normalizedSeed.length >= MIN_PREFIX_LENGTH &&
    normalizedSeed.length <= MAX_PREFIX_LENGTH
  ) {
    return normalizedSeed;
  }

  let prefix = normalizedSeed.slice(0, DEFAULT_PREFIX_LENGTH);
  for (let i = prefix.length; i < DEFAULT_PREFIX_LENGTH; i += 1) {
    prefix += chars[Math.floor(Math.random() * chars.length)];
  }

  return prefix;
}

function normalizeArtistName(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function resolveArtistId(input: {
  artistId?: number | null;
  artistSlug?: string | null;
  tenantId?: string | null;
}) {
  if (input.artistId) {
    const artistUser = await db.user.findUnique({
      where: { id: input.artistId },
      select: { id: true },
    });

    if (!artistUser) {
      throw new NotFoundError("Artist user not found.");
    }
    const allowedIds = await filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: [artistUser.id],
      tenantId: input.tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    });
    if (!allowedIds.includes(artistUser.id)) {
      throw new NotFoundError("Artist user not found.");
    }

    return artistUser.id;
  }

  if (input.artistSlug) {
    const artistUser = await db.user.findUnique({
      where: { slug: input.artistSlug },
      select: { id: true },
    });

    if (!artistUser) {
      throw new NotFoundError("Artist user not found.");
    }
    const allowedIds = await filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: [artistUser.id],
      tenantId: input.tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    });
    if (!allowedIds.includes(artistUser.id)) {
      throw new NotFoundError("Artist user not found.");
    }

    return artistUser.id;
  }

  return null;
}

async function assertUniqueSlug(slug: string, excludeId?: number) {
  const existing = await db.reaction.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (existing && existing.id !== excludeId) {
    throw new ConflictError("Emoji slug already exists.");
  }
}

async function ensureUserExists(userId: number, tenantId?: string | null) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }
  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "User",
    ids: [user.id],
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!allowedIds.includes(user.id)) {
    throw new NotFoundError("User not found.");
  }
}

async function ensureGameExists(gameId: number, tenantId?: string | null) {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { id: true },
  });

  if (!game) {
    throw new NotFoundError("Game not found.");
  }
  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [game.id],
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!allowedIds.includes(game.id)) {
    throw new NotFoundError("Game not found.");
  }
}

async function ensureUserPrefix(userId: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, slug: true, emotePrefix: true },
  });

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  const prefix = user.emotePrefix ?? generatePrefix(user.slug);

  if (!user.emotePrefix) {
    await db.user.update({
      where: { id: userId },
      data: { emotePrefix: prefix },
    });
  }

  return prefix;
}

async function ensureGamePrefix(
  gameSlug: string,
  actorId: number,
  tenantId?: string | null,
) {
  const game = await db.game.findUnique({
    where: { slug: gameSlug },
    include: {
      pages: true,
      team: {
        include: {
          users: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!game) {
    throw new NotFoundError("Game not found.");
  }
  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [game.id],
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!allowedIds.includes(game.id)) {
    throw new NotFoundError("Game not found.");
  }

  const isMember = game.team.users.some((user) => user.id === actorId);
  if (!isMember) {
    throw new ForbiddenError("Not allowed to add game emojis.");
  }

  const jamPage = getJamPage(game);
  const prefix = jamPage?.emotePrefix ?? generatePrefix(game.slug);

  if (jamPage && !jamPage.emotePrefix) {
    await db.gamePage.update({
      where: { id: jamPage.id },
      data: { emotePrefix: prefix },
    });
  }

  return { gameId: game.id, prefix };
}

function materializeEmoji<TEmoji extends EmojiRecord>(emoji: TEmoji) {
  if (!emoji.ownerGame) {
    return emoji;
  }

  return {
    ...emoji,
    ownerGame: {
      ...emoji.ownerGame,
      name: emoji.ownerGame.pages?.[0]?.name ?? emoji.ownerGame.slug,
      thumbnail: emoji.ownerGame.pages?.[0]?.thumbnail ?? null,
    },
  };
}

async function loadEmojiUseCounts() {
  const [postCounts, commentCounts, radioCounts] = await Promise.all([
    db.postReaction.groupBy({
      by: ["reactionId"],
      _count: { _all: true },
    }),
    db.commentReaction.groupBy({
      by: ["reactionId"],
      _count: { _all: true },
    }),
    db.radioEmote.groupBy({
      by: ["emote"],
      _count: { emote: true },
    }),
  ]);

  const byReactionId = new Map<number, number>();
  for (const row of postCounts) {
    byReactionId.set(row.reactionId, (byReactionId.get(row.reactionId) ?? 0) + row._count._all);
  }
  for (const row of commentCounts) {
    byReactionId.set(row.reactionId, (byReactionId.get(row.reactionId) ?? 0) + row._count._all);
  }

  const bySlug = new Map<string, number>();
  for (const row of radioCounts) {
    bySlug.set(row.emote, row._count.emote);
  }

  return { byReactionId, bySlug };
}

function withEmojiUseCount<TEmoji extends ReturnType<typeof materializeEmoji>>(
  emoji: TEmoji,
  counts: Awaited<ReturnType<typeof loadEmojiUseCounts>>,
) {
  return {
    ...emoji,
    globalUseCount:
      (counts.byReactionId.get(emoji.id) ?? 0) + (counts.bySlug.get(emoji.slug) ?? 0),
  };
}

async function createEmoji(data: {
  slug: string;
  image: string;
  artist?: string | null;
  artistId: number | null;
  uploaderId: number;
  scopeType: "GLOBAL" | "USER" | "GAME";
  scopeUserId?: number | null;
  scopeGameId?: number | null;
}) {
  const emoji = await db.reaction.create({
    data: {
      slug: data.slug,
      image: data.image.trim(),
      artist: normalizeArtistName(data.artist),
      artistId: data.artistId,
      uploaderId: data.uploaderId,
      scopeType: data.scopeType,
      scopeUserId: data.scopeUserId ?? null,
      scopeGameId: data.scopeGameId ?? null,
    },
    include: emojiInclude,
  });

  return materializeEmoji(emoji);
}

async function loadEditableEmoji(emojiId: number): Promise<EditableEmoji> {
  const emoji = await db.reaction.findUnique({
    where: { id: emojiId },
    select: {
      id: true,
      slug: true,
      image: true,
      artist: true,
      artistId: true,
      scopeType: true,
      scopeUserId: true,
      scopeGameId: true,
      ownerGame: {
        select: {
          team: {
            select: {
              users: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!emoji) {
    throw new NotFoundError("Emoji not found.");
  }

  return emoji;
}

async function assertEmojiTenant(emoji: EditableEmoji, tenantId?: string | null) {
  if (emoji.scopeType === "GLOBAL") {
    return;
  }

  if (emoji.scopeType === "USER" && emoji.scopeUserId) {
    const allowedIds = await filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: [emoji.scopeUserId],
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    });
    if (!allowedIds.includes(emoji.scopeUserId)) {
      throw new NotFoundError("Emoji not found.");
    }
    return;
  }

  if (emoji.scopeType === "GAME" && emoji.scopeGameId) {
    const allowedIds = await filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: [emoji.scopeGameId],
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    });
    if (!allowedIds.includes(emoji.scopeGameId)) {
      throw new NotFoundError("Emoji not found.");
    }
  }
}

function canManageEmoji(emoji: EditableEmoji, actor: EmojiActor) {
  if (actor.admin) {
    return true;
  }

  if (emoji.scopeType === "GLOBAL") {
    return false;
  }

  if (emoji.scopeType === "USER") {
    return emoji.scopeUserId === actor.id;
  }

  return (
    emoji.ownerGame?.team.users.some((user) => user.id === actor.id) ?? false
  );
}

function assertCanManageEmoji(emoji: EditableEmoji, actor: EmojiActor) {
  if (!canManageEmoji(emoji, actor)) {
    throw new ForbiddenError("Not allowed to manage this emoji.");
  }
}

function resolveScopedSlug(baseSlug: string, prefix?: string) {
  const cleanSlug = sanitizeSlug(baseSlug, prefix ? 44 : 50);

  if (!cleanSlug) {
    throw new BadRequestError("Invalid slug.");
  }

  return prefix ? `${prefix}${cleanSlug}` : cleanSlug;
}

export async function listEmojis(tenantId?: string | null) {
  const emojis = await db.reaction.findMany({
    orderBy: { slug: "asc" },
    include: emojiInclude,
  });
  const useCounts = await loadEmojiUseCounts();

  if (!tenantId) {
    return emojis.map((emoji) => withEmojiUseCount(materializeEmoji(emoji), useCounts));
  }

  const [allowedUserIds, allowedGameIds] = await Promise.all([
    filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: emojis
        .map((emoji) => emoji.scopeUserId)
        .filter((id): id is number => Number.isInteger(id)),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: emojis
        .map((emoji) => emoji.scopeGameId)
        .filter((id): id is number => Number.isInteger(id)),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  ]);
  const userIds = new Set(allowedUserIds);
  const gameIds = new Set(allowedGameIds);

  return emojis
    .filter((emoji) => {
      if (emoji.scopeType === "GLOBAL") return true;
      if (emoji.scopeType === "USER") return Boolean(emoji.scopeUserId && userIds.has(emoji.scopeUserId));
      return Boolean(emoji.scopeGameId && gameIds.has(emoji.scopeGameId));
    })
    .map((emoji) => withEmojiUseCount(materializeEmoji(emoji), useCounts));
}

export async function createGlobalEmoji({
  actorId,
  input,
  tenantId,
}: {
  actorId: number;
  input: z.infer<typeof createEmojiSchema>;
  tenantId?: string | null;
}) {
  const slug = resolveScopedSlug(input.slug);
  await assertUniqueSlug(slug);

  const artistId = await resolveArtistId({ ...input, tenantId });

  return createEmoji({
    slug,
    image: input.image,
    artist: input.artist,
    artistId,
    uploaderId: actorId,
    scopeType: "GLOBAL",
  });
}

export async function createUserEmoji({
  actorId,
  input,
  tenantId,
}: {
  actorId: number;
  input: z.infer<typeof createEmojiSchema>;
  tenantId?: string | null;
}) {
  const prefix = await ensureUserPrefix(actorId);
  const slug = resolveScopedSlug(input.slug, prefix);
  await assertUniqueSlug(slug);

  const artistId = await resolveArtistId({ ...input, tenantId });

  return createEmoji({
    slug,
    image: input.image,
    artist: input.artist,
    artistId,
    uploaderId: actorId,
    scopeType: "USER",
    scopeUserId: actorId,
  });
}

export async function createGameEmoji({
  actorId,
  gameSlug,
  input,
  tenantId,
}: {
  actorId: number;
  gameSlug: string;
  input: z.infer<typeof createEmojiSchema>;
  tenantId?: string | null;
}) {
  const { gameId, prefix } = await ensureGamePrefix(gameSlug, actorId, tenantId);
  const slug = resolveScopedSlug(input.slug, prefix);
  await assertUniqueSlug(slug);

  const artistId = await resolveArtistId({ ...input, tenantId });

  return createEmoji({
    slug,
    image: input.image,
    artist: input.artist,
    artistId,
    uploaderId: actorId,
    scopeType: "GAME",
    scopeGameId: gameId,
  });
}

export async function updateEmoji({
  emojiId,
  actor,
  input,
  tenantId,
}: {
  emojiId: number;
  actor: EmojiActor;
  input: z.infer<typeof updateEmojiSchema>;
  tenantId?: string | null;
}) {
  const existing = await loadEditableEmoji(emojiId);
  await assertEmojiTenant(existing, tenantId);
  assertCanManageEmoji(existing, actor);

  const hasScopeUpdate =
    input.scopeUserId !== undefined || input.scopeGameId !== undefined;

  if (hasScopeUpdate && !actor.admin) {
    throw new ForbiddenError("Only admins can reassign emoji scope.");
  }

  const nextSlug =
    input.slug !== undefined ? resolveScopedSlug(input.slug) : existing.slug;
  await assertUniqueSlug(nextSlug, existing.id);

  let nextArtistId = existing.artistId;
  if (input.artistId !== undefined || input.artistSlug !== undefined) {
    nextArtistId = await resolveArtistId({
      artistId: input.artistId,
      artistSlug: input.artistSlug ?? undefined,
      tenantId,
    });
  }

  let scopeType = existing.scopeType;
  let scopeUserId = existing.scopeUserId;
  let scopeGameId = existing.scopeGameId;

  if (hasScopeUpdate) {
    if (input.scopeUserId) {
      await ensureUserExists(input.scopeUserId, tenantId);
      scopeType = "USER";
      scopeUserId = input.scopeUserId;
      scopeGameId = null;
    } else if (input.scopeGameId) {
      await ensureGameExists(input.scopeGameId, tenantId);
      scopeType = "GAME";
      scopeGameId = input.scopeGameId;
      scopeUserId = null;
    } else {
      scopeType = "GLOBAL";
      scopeUserId = null;
      scopeGameId = null;
    }
  }

  const updated = await db.reaction.update({
    where: { id: emojiId },
    data: {
      slug: nextSlug,
      image: input.image?.trim() ?? existing.image,
      artist:
        input.artist !== undefined
          ? normalizeArtistName(input.artist)
          : existing.artist,
      artistId: nextArtistId,
      uploaderId: actor.id,
      scopeType,
      scopeUserId,
      scopeGameId,
    },
    include: emojiInclude,
  });

  return materializeEmoji(updated);
}

export async function deleteEmoji({
  emojiId,
  actor,
  tenantId,
}: {
  emojiId: number;
  actor: EmojiActor;
  tenantId?: string | null;
}) {
  const existing = await loadEditableEmoji(emojiId);
  await assertEmojiTenant(existing, tenantId);
  assertCanManageEmoji(existing, actor);

  await db.$transaction([
    db.postReaction.deleteMany({ where: { reactionId: emojiId } }),
    db.commentReaction.deleteMany({ where: { reactionId: emojiId } }),
    db.reaction.delete({ where: { id: emojiId } }),
  ]);
}

