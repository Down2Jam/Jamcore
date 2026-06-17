import { z } from "zod";

import { appConfig } from "../../config/app.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { resolveJamReference } from "../jams/index.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../lib/errors.js";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const getRecapVisibilityQuerySchema = z.object({
  userSlug: z.preprocess(firstQueryValue, z.string().trim().optional()),
  jamSlug: z.preprocess(firstQueryValue, z.string().trim().min(1).optional()),
  jamId: z.preprocess(
    firstQueryValue,
    z.coerce.number().int().positive().optional(),
  ),
});

export const updateRecapVisibilitySchema = z
  .object({
    jamId: z.coerce.number().int().positive().optional(),
    jamSlug: z.string().trim().min(1).optional(),
    isPublic: z.boolean(),
  })
  .refine((value) => Boolean(value.jamId || value.jamSlug), {
    message: "jamId or jamSlug is required",
    path: ["jamSlug"],
  });

type RecapVisibilityPayload = {
  kind: "jam-recap-visibility";
  jamId: number;
  isPublic: boolean;
};

type RecapActor = {
  id: number;
  slug: string;
};

function parseVisibilityPayload(raw: string): RecapVisibilityPayload | null {
  try {
    const parsed = JSON.parse(raw) as RecapVisibilityPayload;
    if (parsed?.kind !== "jam-recap-visibility") return null;
    if (!Number.isInteger(parsed?.jamId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

type RecapViewer = {
  id?: number | null;
  slug?: string | null;
} | null | undefined;

async function assertRecapEntityTenant({
  entityType,
  entityId,
  tenantId,
  message,
}: {
  entityType: "User" | "Jam" | "Game";
  entityId: number;
  tenantId?: string | null;
  message: string;
}) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType,
    entityId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError(message);
  }
}

export async function getRecapVisibility({
  userSlug,
  jamId,
  jamSlug,
  viewer,
  tenantId,
}: {
  userSlug?: string;
  jamId?: number;
  jamSlug?: string;
  viewer?: RecapViewer;
  tenantId?: string | null;
}) {
  const targetSlug = userSlug || viewer?.slug;
  if (!targetSlug) {
    throw new UnauthorizedError("Not authenticated");
  }

  const targetUser = await db.user.findUnique({
    where: { slug: targetSlug },
    select: {
      id: true,
      slug: true,
      teams: {
        select: {
          jamId: true,
          game: {
            select: {
              id: true,
              jamId: true,
              published: true,
            },
          },
        },
      },
    },
  });

  if (!targetUser) {
    throw new NotFoundError("User not found");
  }
  await assertRecapEntityTenant({
    entityType: "User",
    entityId: targetUser.id,
    tenantId,
    message: "User not found",
  });

  const latestJamId =
    targetUser.teams
      .map((team) => team.game?.jamId ?? team.jamId)
      .filter((id): id is number => Number.isInteger(id))
      .sort((a, b) => b - a)[0] ??
    (
      await db.jam.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      })
    )?.id;

  if (!latestJamId) {
    return {
      jamId: jamId ?? null,
      isPublic: false,
      canEdit: viewer?.slug === targetUser.slug,
      sharePath: null,
    };
  }

  const targetJam = await resolveJamReference({
    jamId: jamId || latestJamId,
    jamSlug,
  });
  const targetJamId = targetJam?.id ?? jamId ?? latestJamId;
  if (!targetJamId) {
    throw new NotFoundError("Jam not found");
  }
  await assertRecapEntityTenant({
    entityType: "Jam",
    entityId: targetJamId,
    tenantId,
    message: "Jam not found",
  });
  const ownerGame = targetUser.teams.find(
    (team) => team.game?.published && team.game.jamId === targetJamId,
  )?.game;
  if (ownerGame) {
    await assertRecapEntityTenant({
      entityType: "Game",
      entityId: ownerGame.id,
      tenantId,
      message: "Game not found",
    });
  }

  const jamPage = ownerGame
    ? await db.gamePage.findFirst({
        where: {
          gameId: ownerGame.id,
          version: "JAM",
        },
        select: {
          id: true,
        },
      })
    : null;

  const visibilityRows = jamPage
    ? await db.data.findMany({
        where: {
          userId: targetUser.id,
          gamePageId: jamPage.id,
        },
        select: {
          data: true,
        },
      })
    : [];

  const visibility = visibilityRows
    .map((row) => parseVisibilityPayload(row.data))
    .find((payload) => payload?.jamId === targetJamId);

  const isPublic = Boolean(visibility?.isPublic);
  const canEdit = viewer?.slug === targetUser.slug;

  return {
    jamId: targetJamId,
    jamSlug: targetJam?.slug ?? null,
    isPublic,
    canEdit,
    sharePath: isPublic
      ? `/recap/${targetUser.slug}?jam=${targetJam?.slug ?? targetJamId}`
      : null,
  };
}

export async function updateRecapVisibility({
  jamId,
  jamSlug,
  isPublic,
  actor,
  tenantId,
}: {
  jamId?: number;
  jamSlug?: string;
  isPublic: boolean;
  actor: RecapActor | null | undefined;
  tenantId?: string | null;
}) {
  if (!actor?.id || !actor.slug) {
    throw new UnauthorizedError("Not authenticated");
  }

  const targetJam = await resolveJamReference({
    jamId,
    jamSlug,
  });
  if (!targetJam) {
    throw new NotFoundError("Jam not found");
  }
  await assertRecapEntityTenant({
    entityType: "Jam",
    entityId: targetJam.id,
    tenantId,
    message: "Jam not found",
  });

  const ownerGame = await db.game.findFirst({
    where: {
      jamId: targetJam.id,
      published: true,
      team: {
        users: {
          some: {
            id: actor.id,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!ownerGame) {
    throw new ForbiddenError("You need a published game in this jam to share a recap.");
  }
  await assertRecapEntityTenant({
    entityType: "Game",
    entityId: ownerGame.id,
    tenantId,
    message: "Game not found",
  });

  const jamPage = await db.gamePage.findFirst({
    where: {
      gameId: ownerGame.id,
      version: "JAM",
    },
    select: {
      id: true,
    },
  });

  if (!jamPage) {
    throw new BadRequestError("Jam page missing for published game.");
  }

  const existingRows = await db.data.findMany({
    where: {
      userId: actor.id,
      gamePageId: jamPage.id,
    },
    select: {
      id: true,
      data: true,
    },
  });

  const existing = existingRows.find((row) => {
    const payload = parseVisibilityPayload(row.data);
    return payload?.jamId === jamId;
  });

  const payload: RecapVisibilityPayload = {
    kind: "jam-recap-visibility",
    jamId: targetJam.id,
    isPublic,
  };

  if (existing) {
    await db.data.update({
      where: { id: existing.id },
      data: {
        data: JSON.stringify(payload),
      },
    });
  } else {
    await db.data.create({
      data: {
        data: JSON.stringify(payload),
        userId: actor.id,
        gamePageId: jamPage.id,
      },
    });
  }

  return {
    jamId: targetJam.id,
    jamSlug: targetJam.slug,
    isPublic,
    canEdit: true,
    sharePath: isPublic ? `/recap/${actor.slug}?jam=${targetJam.slug}` : null,
  };
}

