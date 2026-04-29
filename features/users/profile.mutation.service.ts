import db from "../../infra/db.js";
import { appConfig } from "../../config/app.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { BadRequestError, ConflictError } from "../../lib/errors.js";
import { materializeGamePage } from "../games/page.helpers.js";
import { notifyNewMentions } from "../mentions/notifications.service.js";
import { materializeTrackPage } from "../tracks/page.js";
import type { UpdateUserProfileInput } from "./profile.schemas.js";

const PREFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;

const updatedUserSelect = {
  id: true,
  email: true,
  name: true,
  bio: true,
  short: true,
  profilePicture: true,
  profileBackground: true,
  createdAt: true,
  slug: true,
  mod: true,
  admin: true,
  twitch: true,
  jams: true,
  bannerPicture: true,
  pronouns: true,
  links: true,
  linkLabels: true,
  emotePrefix: true,
  hideRatings: true,
  autoHideRatingsWhileStreaming: true,
  primaryRoles: { select: { slug: true } },
  secondaryRoles: { select: { slug: true } },
  recommendedGames: {
    select: {
      id: true,
      slug: true,
      category: true,
      pages: {
        where: { version: "JAM" },
        include: {
          downloadLinks: true,
        },
        take: 1,
      },
      downloadLinks: {
        select: {
          id: true,
          url: true,
          platform: true,
        },
      },
      jam: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
  recommendedPosts: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
  recommendedTracks: {
    select: {
      id: true,
      name: true,
      url: true,
      composer: { select: { name: true } },
      gamePage: {
        select: {
          version: true,
          gameId: true,
          game: {
            select: {
              slug: true,
              jamId: true,
              pages: {
                where: { version: "JAM" },
                select: { name: true, thumbnail: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  },
} as const;

function buildPrefix(source?: string | null): string {
  const normalized = String(source ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (
    normalized.length >= MIN_PREFIX_LENGTH &&
    normalized.length <= MAX_PREFIX_LENGTH
  ) {
    return normalized;
  }

  let prefix = normalized.slice(0, DEFAULT_PREFIX_LENGTH);
  let seed = 0;
  const seedSource = normalized || appConfig.users.defaultPrefixSeed;
  for (let i = 0; i < seedSource.length; i++) {
    seed = (seed * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  while (prefix.length < DEFAULT_PREFIX_LENGTH) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    prefix += PREFIX_CHARS[seed % PREFIX_CHARS.length];
  }

  return prefix;
}

function normalizeIdList(ids?: number[]) {
  return Array.isArray(ids) ? [...new Set(ids)] : [];
}

async function assertRecommendationIdsExist(input: {
  recommendedGameIds?: number[];
  recommendedPostIds?: number[];
  recommendedTrackIds?: number[];
  recommendedHiddenGameIds?: number[];
  recommendedHiddenTrackIds?: number[];
  tenantId?: string | null;
}) {
  const rawGameIds = normalizeIdList([
    ...(input.recommendedGameIds ?? []),
    ...(input.recommendedHiddenGameIds ?? []),
  ]);
  const rawPostIds = normalizeIdList(input.recommendedPostIds);
  const rawTrackIds = normalizeIdList([
    ...(input.recommendedTrackIds ?? []),
    ...(input.recommendedHiddenTrackIds ?? []),
  ]);

  const [existingGames, existingPosts, existingTracks] = await Promise.all([
    rawGameIds.length
      ? db.game.findMany({
          where: { id: { in: rawGameIds }, published: true },
          select: { id: true },
        })
      : Promise.resolve([]),
    rawPostIds.length
      ? db.post.findMany({
          where: {
            id: { in: rawPostIds },
            deletedAt: null,
            removedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    rawTrackIds.length
      ? db.gamePageTrack.findMany({
          where: {
            id: { in: rawTrackIds },
            gamePage: {
              game: {
                published: true,
              },
            },
          },
          select: {
            id: true,
            gamePage: {
              select: {
                game: {
                  select: { id: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const allowedGameIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: existingGames.map((entry) => entry.id),
      tenantId: input.tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  );
  const allowedPostIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Post",
      ids: existingPosts.map((entry) => entry.id),
      tenantId: input.tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  );
  const allowedTrackGameIds = new Set(
    await filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: existingTracks
        .map((entry) => entry.gamePage?.game?.id)
        .filter((id): id is number => Number.isInteger(id)),
      tenantId: input.tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  );
  const allowedTrackIds = new Set(
    existingTracks
      .filter((entry) => allowedTrackGameIds.has(entry.gamePage.game.id))
      .map((entry) => entry.id),
  );

  if (
    rawGameIds.some((id) => !allowedGameIds.has(id)) ||
    rawPostIds.some((id) => !allowedPostIds.has(id)) ||
    rawTrackIds.some((id) => !allowedTrackIds.has(id))
  ) {
    throw new BadRequestError("Invalid recommendation ids.");
  }

  return {
    recommendedGameIds: normalizeIdList(input.recommendedGameIds),
    recommendedPostIds: normalizeIdList(input.recommendedPostIds),
    recommendedTrackIds: normalizeIdList(input.recommendedTrackIds),
    recommendedHiddenGameIds: normalizeIdList(input.recommendedHiddenGameIds),
    recommendedHiddenTrackIds: normalizeIdList(input.recommendedHiddenTrackIds),
  };
}

async function syncReactionPrefix(
  userId: number,
  oldPrefix: string | null,
  newPrefix: string,
) {
  if (!newPrefix || newPrefix === oldPrefix) {
    return;
  }

  const userReactions = await db.reaction.findMany({
    where: {
      scopeType: "USER",
      scopeUserId: userId,
    },
    select: { id: true, slug: true },
  });

  if (userReactions.length === 0) {
    return;
  }

  const suffixLength = oldPrefix ? oldPrefix.length : 6;
  const updates = userReactions.map((reaction) => {
    const suffix = reaction.slug.slice(suffixLength);
    return { id: reaction.id, slug: `${newPrefix}${suffix}` };
  });

  const nextSlugs = updates.map((entry) => entry.slug);
  if (new Set(nextSlugs).size !== nextSlugs.length) {
    throw new ConflictError("Emote prefix causes duplicates.");
  }

  const conflicts = await db.reaction.findMany({
    where: {
      slug: { in: nextSlugs },
      NOT: { id: { in: updates.map((entry) => entry.id) } },
    },
    select: { id: true },
  });

  if (conflicts.length > 0) {
    throw new ConflictError("Emote prefix already in use.");
  }

  await db.$transaction(
    updates.map((entry) =>
      db.reaction.update({
        where: { id: entry.id },
        data: { slug: entry.slug },
      }),
    ),
  );
}

async function syncRoles(
  userId: number,
  currentPrimaryRoles: string[],
  currentSecondaryRoles: string[],
  primaryRoles?: string[],
  secondaryRoles?: string[],
) {
  if (!primaryRoles && !secondaryRoles) {
    return;
  }

  await db.user.update({
    where: { id: userId },
    data: {
      ...(primaryRoles
        ? {
            primaryRoles: {
              disconnect: currentPrimaryRoles
                .filter((role) => !primaryRoles.includes(role))
                .map((slug) => ({ slug })),
              connect: primaryRoles.map((slug) => ({ slug })),
            },
          }
        : {}),
      ...(secondaryRoles
        ? {
            secondaryRoles: {
              disconnect: currentSecondaryRoles
                .filter((role) => !secondaryRoles.includes(role))
                .map((slug) => ({ slug })),
              connect: secondaryRoles.map((slug) => ({ slug })),
            },
          }
        : {}),
    },
  });
}

async function filterUpdatedRecommendations(user: any, tenantId?: string | null) {
  const [gameIds, postIds, trackGameIds] = await Promise.all([
    filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: (user.recommendedGames ?? []).map((game: any) => game.id),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "Post",
      ids: (user.recommendedPosts ?? []).map((post: any) => post.id),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "Game",
      ids: (user.recommendedTracks ?? [])
        .map((track: any) => track.gamePage?.gameId)
        .filter((id: unknown): id is number => Number.isInteger(id)),
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    }),
  ]);

  const allowedGameIds = new Set(gameIds);
  const allowedPostIds = new Set(postIds);
  const allowedTrackGameIds = new Set(trackGameIds);

  return {
    ...user,
    recommendedGames: (user.recommendedGames ?? []).filter((game: any) =>
      allowedGameIds.has(game.id),
    ),
    recommendedPosts: (user.recommendedPosts ?? []).filter((post: any) =>
      allowedPostIds.has(post.id),
    ),
    recommendedTracks: (user.recommendedTracks ?? []).filter((track: any) =>
      allowedTrackGameIds.has(track.gamePage?.gameId),
    ),
  };
}

async function materializeUpdatedUser(user: any, tenantId?: string | null) {
  const filteredUser = await filterUpdatedRecommendations(user, tenantId);
  const materializeJamGameSummary = (game: any) =>
    materializeGamePage(
      {
        ...game,
        downloadLinks: game.downloadLinks,
        pages: game.pages,
      },
      "JAM" as any,
    );

  return {
    ...filteredUser,
    recommendedGames: (filteredUser.recommendedGames ?? []).map(materializeJamGameSummary),
    recommendedTracks: (filteredUser.recommendedTracks ?? []).map(materializeTrackPage),
  };
}

export async function updateUserProfile({
  actorUser,
  targetUser,
  input,
  tenantId,
}: {
  actorUser: any;
  targetUser: any;
  input: UpdateUserProfileInput;
  tenantId?: string | null;
}) {
  const oldPrefix = targetUser.emotePrefix ?? null;
  const cleanedPrefix =
    input.emotePrefix?.trim().toLowerCase() ||
    buildPrefix(input.name ?? targetUser.name ?? targetUser.slug);

  const normalizedLinks = input.links?.map((entry) => entry.trim()).filter(Boolean);
  const normalizedLabels = input.linkLabels?.map((entry) => entry.trim());
  const normalizedRecommendations = await assertRecommendationIdsExist({
    ...input,
    tenantId,
  });

  await db.user.update({
    where: {
      id: targetUser.id,
    },
    data: {
      ...(input.email !== undefined ? { email: input.email ?? null } : {}),
      ...(input.profilePicture !== undefined
        ? { profilePicture: input.profilePicture || null }
        : {}),
      ...(input.bannerPicture !== undefined
        ? { bannerPicture: input.bannerPicture || null }
        : {}),
      ...(input.profileBackground !== undefined
        ? { profileBackground: input.profileBackground }
        : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.short !== undefined ? { short: input.short } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.pronouns !== undefined ? { pronouns: input.pronouns || null } : {}),
      ...(normalizedLinks !== undefined ? { links: normalizedLinks } : {}),
      ...(normalizedLabels !== undefined ? { linkLabels: normalizedLabels } : {}),
      emotePrefix: cleanedPrefix,
      ...(typeof input.hideRatings === "boolean"
        ? { hideRatings: input.hideRatings }
        : {}),
      ...(typeof input.autoHideRatingsWhileStreaming === "boolean"
        ? { autoHideRatingsWhileStreaming: input.autoHideRatingsWhileStreaming }
        : {}),
      ...(input.recommendedGameIds
        ? {
            recommendedGameOverrideIds: normalizedRecommendations.recommendedGameIds,
            recommendedGames: {
              set: normalizedRecommendations.recommendedGameIds.map((id) => ({ id })),
            },
          }
        : {}),
      ...(input.recommendedPostIds
        ? {
            recommendedPosts: {
              set: normalizedRecommendations.recommendedPostIds.map((id) => ({ id })),
            },
          }
        : {}),
      ...(input.recommendedTrackIds
        ? {
            recommendedTrackOverrideIds: normalizedRecommendations.recommendedTrackIds,
            recommendedTracks: {
              set: normalizedRecommendations.recommendedTrackIds.map((id) => ({ id })),
            },
          }
        : {}),
      ...(input.recommendedHiddenGameIds
        ? {
            recommendedGameHiddenIds:
              normalizedRecommendations.recommendedHiddenGameIds,
          }
        : {}),
      ...(input.recommendedHiddenTrackIds
        ? {
            recommendedTrackHiddenIds:
              normalizedRecommendations.recommendedHiddenTrackIds,
          }
        : {}),
    },
  });

  await syncReactionPrefix(targetUser.id, oldPrefix, cleanedPrefix);
  await syncRoles(
    targetUser.id,
    (targetUser.primaryRoles ?? []).map((role: any) => role.slug),
    (targetUser.secondaryRoles ?? []).map((role: any) => role.slug),
    input.primaryRoles,
    input.secondaryRoles,
  );

  const updatedUser = await db.user.findUnique({
    where: { id: targetUser.id },
    select: updatedUserSelect,
  });

  if (!updatedUser) {
    throw new BadRequestError("Updated user missing.");
  }

  await notifyNewMentions({
    type: "profile",
    actorId: actorUser.id,
    actorName: actorUser.name,
    actorSlug: actorUser.slug,
    beforeContent: targetUser?.bio ?? "",
    afterContent: input.bio ?? targetUser?.bio ?? "",
    profileSlug: updatedUser.slug,
  });

  return materializeUpdatedUser(updatedUser, tenantId);
}
