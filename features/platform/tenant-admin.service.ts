import { GameCategory } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { appConfig } from "../../config/app.js";
import {
  assignCoreEntityTenant,
  doesCoreEntityBelongToTenant,
  filterCoreEntityIdsByTenant,
  listCoreEntitiesByTenant,
} from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { hashPassword } from "../../infra/password.js";
import { emitDomainEvent } from "../../lib/domainEvents.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const userSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.string().email().nullable().optional(),
  password: z.string().min(1).optional(),
  profilePicture: z.string().nullable().optional(),
  bannerPicture: z.string().nullable().optional(),
  profileBackground: z.string().nullable().optional(),
  short: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  pronouns: z.string().nullable().optional(),
  links: z.array(z.string()).optional(),
  linkLabels: z.array(z.string()).optional(),
  mod: z.boolean().optional(),
  admin: z.boolean().optional(),
  twitch: z.string().nullable().optional(),
  emotePrefix: z.string().nullable().optional(),
});

const jamSnapshotSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).optional(),
  startTime: z.string().datetime(),
  suggestionHours: z.number().int().nonnegative(),
  slaughterHours: z.number().int().nonnegative(),
  votingHours: z.number().int().nonnegative(),
  jammingHours: z.number().int().nonnegative(),
  ratingHours: z.number().int().nonnegative(),
  submissionHours: z.number().int().nonnegative(),
  postJamRefinementHours: z.number().int().nonnegative(),
  postJamRatingHours: z.number().int().nonnegative(),
  isActive: z.boolean(),
  themePerUser: z.number().int().nonnegative(),
  themePerRound: z.number().int().nonnegative(),
  noOfRounds: z.number().int().nonnegative(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

const teamSnapshotSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().nullable().optional(),
  applicationsOpen: z.boolean(),
  description: z.string().nullable().optional(),
  ownerId: z.number().int().positive(),
  jamId: z.number().int().positive(),
});

const gameSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().trim().min(1),
  category: z.nativeEnum(GameCategory),
  published: z.boolean(),
  teamId: z.number().int().positive(),
  jamId: z.number().int().positive(),
});

const postSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  content: z.string(),
  sticky: z.boolean(),
  editedAt: z.string().datetime().nullable().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
  removedAt: z.string().datetime().nullable().optional(),
  authorId: z.number().int().positive(),
});

export const importTenantSnapshotSchema = z.object({
  mode: z.enum(["validate", "apply"]).default("validate"),
  snapshot: z.object({
    tenantId: z.string().trim().min(1),
    users: z.array(userSnapshotSchema).default([]),
    jams: z.array(jamSnapshotSchema).default([]),
    teams: z.array(teamSnapshotSchema).default([]),
    games: z.array(gameSnapshotSchema).default([]),
    posts: z.array(postSnapshotSchema).default([]),
  }),
});

export const restoreTenantResourceSchema = z.object({
  resourceType: z.enum(["post"]),
  resourceId: z.number().int().positive(),
});

type ExportOptions = {
  tenantId?: string | null;
  includeSecrets?: boolean;
};

type WriteClient = Prisma.TransactionClient;
type ImportEntityType = "User" | "Jam" | "Team" | "Game" | "Post";

function resolvedTenantId(tenantId?: string | null) {
  return tenantId ?? appConfig.platform.multiTenant.defaultTenantId;
}

async function loadUsers(ids: number[], includeSecrets: boolean) {
  if (ids.length === 0) {
    return [];
  }

  return db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      name: true,
      email: includeSecrets,
      password: includeSecrets,
      profilePicture: true,
      bannerPicture: true,
      profileBackground: true,
      short: true,
      bio: true,
      pronouns: true,
      links: true,
      linkLabels: true,
      mod: true,
      admin: true,
      twitch: true,
      emotePrefix: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function exportTenantSnapshot(options: ExportOptions) {
  const tenantId = resolvedTenantId(options.tenantId);
  const strictIsolation = appConfig.platform.multiTenant.strictIsolation;

  const [userIds, jamIds, teamIds, gameIds, postIds] = await Promise.all([
    listCoreEntitiesByTenant({ entityType: "User", tenantId, strictIsolation, limit: 5000 }),
    listCoreEntitiesByTenant({ entityType: "Jam", tenantId, strictIsolation, limit: 2000 }),
    listCoreEntitiesByTenant({ entityType: "Team", tenantId, strictIsolation, limit: 5000 }),
    listCoreEntitiesByTenant({ entityType: "Game", tenantId, strictIsolation, limit: 5000 }),
    listCoreEntitiesByTenant({ entityType: "Post", tenantId, strictIsolation, limit: 5000 }),
  ]);

  const [users, jams, teams, games, posts] = await Promise.all([
    loadUsers(userIds, options.includeSecrets === true),
    jamIds.length
      ? db.jam.findMany({
          where: { id: { in: jamIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            startTime: true,
            suggestionHours: true,
            slaughterHours: true,
            votingHours: true,
            jammingHours: true,
            ratingHours: true,
            submissionHours: true,
            postJamRefinementHours: true,
            postJamRatingHours: true,
            isActive: true,
            themePerUser: true,
            themePerRound: true,
            noOfRounds: true,
            icon: true,
            color: true,
          },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    teamIds.length
      ? db.team.findMany({
          where: { id: { in: teamIds } },
          select: {
            id: true,
            name: true,
            applicationsOpen: true,
            description: true,
            ownerId: true,
            jamId: true,
          },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    gameIds.length
      ? db.game.findMany({
          where: { id: { in: gameIds } },
          select: {
            id: true,
            slug: true,
            category: true,
            published: true,
            teamId: true,
            jamId: true,
          },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
    postIds.length
      ? db.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            slug: true,
            title: true,
            content: true,
            sticky: true,
            editedAt: true,
            deletedAt: true,
            removedAt: true,
            authorId: true,
          },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return {
    tenantId,
    exportedAt: new Date().toISOString(),
    includeSecrets: options.includeSecrets === true,
    counts: {
      users: users.length,
      jams: jams.length,
      teams: teams.length,
      games: games.length,
      posts: posts.length,
    },
    users,
    jams: jams.map((jam) => ({ ...jam, startTime: jam.startTime.toISOString() })),
    teams,
    games,
    posts: posts.map((post) => ({
      ...post,
      editedAt: post.editedAt?.toISOString() ?? null,
      deletedAt: post.deletedAt?.toISOString() ?? null,
      removedAt: post.removedAt?.toISOString() ?? null,
    })),
  };
}

async function validateImportReferences(snapshot: z.infer<typeof importTenantSnapshotSchema>["snapshot"]) {
  const issues: string[] = [];
  const tenantId = resolvedTenantId(snapshot.tenantId);
  const strictIsolation = appConfig.platform.multiTenant.strictIsolation;
  const userIds = new Set(snapshot.users.map((user) => user.id));
  const jamIds = new Set(snapshot.jams.map((jam) => jam.id));
  const teamIds = new Set(snapshot.teams.map((team) => team.id));
  const ownerIdsToCheck = [...new Set(snapshot.teams.map((team) => team.ownerId).filter((id) => !userIds.has(id)))];
  const jamIdsToCheck = [...new Set(
    [
      ...snapshot.teams.map((team) => team.jamId),
      ...snapshot.games.map((game) => game.jamId),
    ].filter((id) => !jamIds.has(id)),
  )];
  const teamIdsToCheck = [...new Set(snapshot.games.map((game) => game.teamId).filter((id) => !teamIds.has(id)))];
  const authorIdsToCheck = [...new Set(snapshot.posts.map((post) => post.authorId).filter((id) => !userIds.has(id)))];

  const [existingOwners, existingJams, existingTeams, existingAuthors] = await Promise.all([
    ownerIdsToCheck.length
      ? db.user.findMany({ where: { id: { in: ownerIdsToCheck } }, select: { id: true } })
      : Promise.resolve([]),
    jamIdsToCheck.length
      ? db.jam.findMany({ where: { id: { in: jamIdsToCheck } }, select: { id: true } })
      : Promise.resolve([]),
    teamIdsToCheck.length
      ? db.team.findMany({ where: { id: { in: teamIdsToCheck } }, select: { id: true } })
      : Promise.resolve([]),
    authorIdsToCheck.length
      ? db.user.findMany({ where: { id: { in: authorIdsToCheck } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const existingOwnerIds = new Set(existingOwners.map((item) => item.id));
  const existingJamIds = new Set(existingJams.map((item) => item.id));
  const existingTeamIds = new Set(existingTeams.map((item) => item.id));
  const existingAuthorIds = new Set(existingAuthors.map((item) => item.id));
  const [allowedOwners, allowedJams, allowedTeams, allowedAuthors] = await Promise.all([
    filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: [...existingOwnerIds],
      tenantId,
      strictIsolation,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "Jam",
      ids: [...existingJamIds],
      tenantId,
      strictIsolation,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "Team",
      ids: [...existingTeamIds],
      tenantId,
      strictIsolation,
    }),
    filterCoreEntityIdsByTenant({
      entityType: "User",
      ids: [...existingAuthorIds],
      tenantId,
      strictIsolation,
    }),
  ]);
  const allowedOwnerIds = new Set(allowedOwners);
  const allowedJamIds = new Set(allowedJams);
  const allowedTeamIds = new Set(allowedTeams);
  const allowedAuthorIds = new Set(allowedAuthors);

  issues.push(
    ...(await validateExistingSnapshotOwnership("User", [...userIds], tenantId)),
    ...(await validateExistingSnapshotOwnership("Jam", [...jamIds], tenantId)),
    ...(await validateExistingSnapshotOwnership("Team", [...teamIds], tenantId)),
    ...(await validateExistingSnapshotOwnership("Game", snapshot.games.map((game) => game.id), tenantId)),
    ...(await validateExistingSnapshotOwnership("Post", snapshot.posts.map((post) => post.id), tenantId)),
  );

  for (const team of snapshot.teams) {
    if (!userIds.has(team.ownerId) && !existingOwnerIds.has(team.ownerId)) {
      issues.push(`Team ${team.id} references missing owner ${team.ownerId}`);
    } else if (!userIds.has(team.ownerId) && !allowedOwnerIds.has(team.ownerId)) {
      issues.push(`Team ${team.id} references owner ${team.ownerId} outside tenant ${tenantId}`);
    }
    if (!jamIds.has(team.jamId) && !existingJamIds.has(team.jamId)) {
      issues.push(`Team ${team.id} references missing jam ${team.jamId}`);
    } else if (!jamIds.has(team.jamId) && !allowedJamIds.has(team.jamId)) {
      issues.push(`Team ${team.id} references jam ${team.jamId} outside tenant ${tenantId}`);
    }
  }

  for (const game of snapshot.games) {
    if (!teamIds.has(game.teamId) && !existingTeamIds.has(game.teamId)) {
      issues.push(`Game ${game.id} references missing team ${game.teamId}`);
    } else if (!teamIds.has(game.teamId) && !allowedTeamIds.has(game.teamId)) {
      issues.push(`Game ${game.id} references team ${game.teamId} outside tenant ${tenantId}`);
    }
    if (!jamIds.has(game.jamId) && !existingJamIds.has(game.jamId)) {
      issues.push(`Game ${game.id} references missing jam ${game.jamId}`);
    } else if (!jamIds.has(game.jamId) && !allowedJamIds.has(game.jamId)) {
      issues.push(`Game ${game.id} references jam ${game.jamId} outside tenant ${tenantId}`);
    }
  }

  for (const post of snapshot.posts) {
    if (!userIds.has(post.authorId) && !existingAuthorIds.has(post.authorId)) {
      issues.push(`Post ${post.id} references missing author ${post.authorId}`);
    } else if (!userIds.has(post.authorId) && !allowedAuthorIds.has(post.authorId)) {
      issues.push(`Post ${post.id} references author ${post.authorId} outside tenant ${tenantId}`);
    }
  }

  return issues;
}

async function findExistingImportIds(entityType: ImportEntityType, ids: number[]) {
  if (ids.length === 0) {
    return [];
  }

  switch (entityType) {
    case "User":
      return (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((item) => item.id);
    case "Jam":
      return (await db.jam.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((item) => item.id);
    case "Team":
      return (await db.team.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((item) => item.id);
    case "Game":
      return (await db.game.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((item) => item.id);
    case "Post":
      return (await db.post.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((item) => item.id);
  }
}

async function validateExistingSnapshotOwnership(entityType: ImportEntityType, ids: number[], tenantId: string) {
  const existingIds = await findExistingImportIds(entityType, [...new Set(ids)]);
  const allowedIds = await filterCoreEntityIdsByTenant({
    entityType,
    ids: existingIds,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  const allowedIdSet = new Set(allowedIds);

  return existingIds
    .filter((id) => !allowedIdSet.has(id))
    .map((id) => `${entityType} ${id} already exists outside tenant ${tenantId}`);
}

async function upsertImportedUsers(
  client: WriteClient,
  snapshotUsers: z.infer<typeof userSnapshotSchema>[],
  tenantId: string,
) {
  for (const user of snapshotUsers) {
    await client.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        slug: user.slug,
        name: user.name,
        email: user.email ?? null,
        password: user.password ?? (await hashPassword(`import-${randomUUID()}`)),
        profilePicture: user.profilePicture ?? null,
        bannerPicture: user.bannerPicture ?? null,
        profileBackground: user.profileBackground ?? null,
        short: user.short ?? null,
        bio: user.bio ?? null,
        pronouns: user.pronouns ?? null,
        links: user.links ?? [],
        linkLabels: user.linkLabels ?? [],
        mod: user.mod ?? false,
        admin: user.admin ?? false,
        twitch: user.twitch ?? null,
        emotePrefix: user.emotePrefix ?? null,
      },
      update: {
        slug: user.slug,
        name: user.name,
        email: user.email ?? null,
        profilePicture: user.profilePicture ?? null,
        bannerPicture: user.bannerPicture ?? null,
        profileBackground: user.profileBackground ?? null,
        short: user.short ?? null,
        bio: user.bio ?? null,
        pronouns: user.pronouns ?? null,
        links: user.links ?? [],
        linkLabels: user.linkLabels ?? [],
        mod: user.mod ?? false,
        admin: user.admin ?? false,
        twitch: user.twitch ?? null,
        emotePrefix: user.emotePrefix ?? null,
      },
    });
    await assignCoreEntityTenant({ entityType: "User", entityId: user.id, tenantId }, client);
  }
}

export async function importTenantSnapshot(
  input: z.infer<typeof importTenantSnapshotSchema>,
) {
  const snapshot = input.snapshot;
  const tenantId = resolvedTenantId(snapshot.tenantId);
  const issues = await validateImportReferences(snapshot);

  if (input.mode === "validate") {
    return {
      ok: issues.length === 0,
      tenantId,
      issues,
      counts: {
        users: snapshot.users.length,
        jams: snapshot.jams.length,
        teams: snapshot.teams.length,
        games: snapshot.games.length,
        posts: snapshot.posts.length,
      },
    };
  }

  if (issues.length > 0) {
    throw new BadRequestError("Snapshot import validation failed", { issues });
  }

  await db.$transaction(async (tx) => {
    await upsertImportedUsers(tx, snapshot.users, tenantId);

    for (const jam of snapshot.jams) {
      await tx.jam.upsert({
        where: { id: jam.id },
        create: {
          ...jam,
          slug: jam.slug ?? slugify(jam.name),
          startTime: new Date(jam.startTime),
        },
        update: {
          ...jam,
          slug: jam.slug ?? slugify(jam.name),
          startTime: new Date(jam.startTime),
        },
      });
      await assignCoreEntityTenant({ entityType: "Jam", entityId: jam.id, tenantId }, tx);
    }

    for (const team of snapshot.teams) {
      await tx.team.upsert({
        where: { id: team.id },
        create: team,
        update: team,
      });
      await assignCoreEntityTenant({ entityType: "Team", entityId: team.id, tenantId }, tx);
    }

    for (const game of snapshot.games) {
      await tx.game.upsert({
        where: { id: game.id },
        create: game,
        update: game,
      });
      await assignCoreEntityTenant({ entityType: "Game", entityId: game.id, tenantId }, tx);
    }

    for (const post of snapshot.posts) {
      await tx.post.upsert({
        where: { id: post.id },
        create: {
          id: post.id,
          slug: post.slug ?? `imported-post-${post.id}`,
          title: post.title,
          content: post.content,
          sticky: post.sticky,
          editedAt: post.editedAt ? new Date(post.editedAt) : null,
          deletedAt: post.deletedAt ? new Date(post.deletedAt) : null,
          removedAt: post.removedAt ? new Date(post.removedAt) : null,
          authorId: post.authorId,
        },
        update: {
          slug: post.slug ?? `imported-post-${post.id}`,
          title: post.title,
          content: post.content,
          sticky: post.sticky,
          editedAt: post.editedAt ? new Date(post.editedAt) : null,
          deletedAt: post.deletedAt ? new Date(post.deletedAt) : null,
          removedAt: post.removedAt ? new Date(post.removedAt) : null,
          authorId: post.authorId,
        },
      });
      await assignCoreEntityTenant({ entityType: "Post", entityId: post.id, tenantId }, tx);
    }
  });

  await emitDomainEvent({
    type: "tenant.imported",
    tenantId,
    payload: {
      counts: {
        users: snapshot.users.length,
        jams: snapshot.jams.length,
        teams: snapshot.teams.length,
        games: snapshot.games.length,
        posts: snapshot.posts.length,
      },
      tenantId,
    },
  });

  return {
    ok: true,
    tenantId,
    imported: {
      users: snapshot.users.length,
      jams: snapshot.jams.length,
      teams: snapshot.teams.length,
      games: snapshot.games.length,
      posts: snapshot.posts.length,
    },
  };
}

export async function restoreTenantResource(
  input: z.infer<typeof restoreTenantResourceSchema>,
  tenantId?: string | null,
) {
  const normalizedTenantId = resolvedTenantId(tenantId);

  if (input.resourceType !== "post") {
    throw new BadRequestError("Unsupported restore resource");
  }

  const allowed = await doesCoreEntityBelongToTenant({
    entityType: "Post",
    entityId: input.resourceId,
    tenantId: normalizedTenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!allowed) {
    throw new NotFoundError("Resource not found for tenant");
  }

  const post = await db.post.findUnique({
    where: { id: input.resourceId },
    select: {
      id: true,
      deletedAt: true,
      removedAt: true,
    },
  });
  if (!post) {
    throw new NotFoundError("Post not found");
  }
  if (!post.deletedAt && !post.removedAt) {
    throw new BadRequestError("Post is not deleted");
  }

  await db.post.update({
    where: { id: input.resourceId },
    data: {
      deletedAt: null,
      removedAt: null,
    },
  });

  await emitDomainEvent({
    type: "post.restored",
    tenantId: normalizedTenantId,
    payload: {
      postId: input.resourceId,
    },
  });

  return {
    ok: true,
    resourceType: "post",
    resourceId: input.resourceId,
  };
}
