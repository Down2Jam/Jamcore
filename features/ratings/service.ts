import { PageVersion } from "@prisma/client";
import { z } from "zod";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";

export const createGameRatingSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  value: z.coerce.number().int(),
  gamePageId: z.coerce.number().int().positive().optional(),
  pageVersion: z.enum(["JAM", "POST_JAM"]).optional(),
});

export const createTrackRatingSchema = z.object({
  trackId: z.coerce.number().int().positive(),
  categoryId: z.coerce.number().int().positive(),
  value: z.coerce.number().int(),
});

export const createTrackTimestampCommentSchema = z.object({
  trackId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1),
  timestamp: z.coerce.number().min(0),
});

export async function saveGameRating({
  gameId,
  gamePageId,
  pageVersion,
  categoryId,
  value,
  userId,
  tenantId,
}: {
  gameId: number;
  gamePageId?: number;
  pageVersion?: "JAM" | "POST_JAM";
  categoryId: number;
  value: number;
  userId: number;
  tenantId?: string | null;
}) {
  let targetGamePageId = gamePageId;

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: gameId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Game missing.");
  }

  const targetPageVersion =
    pageVersion === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;
  const targetGamePage = await db.gamePage.findFirst({
    where: {
      ...(targetGamePageId ? { id: targetGamePageId } : {}),
      gameId,
      ...(targetGamePageId ? {} : { version: targetPageVersion }),
    },
    select: {
      id: true,
    },
  });

  if (!targetGamePage) {
    throw new NotFoundError("Game page missing.");
  }

  targetGamePageId = targetGamePage.id;

  const currentRating = await db.rating.findUnique({
    where: {
      gamePageId_categoryId_userId: {
        gamePageId: targetGamePageId,
        userId,
        categoryId,
      },
    },
  });

  if (currentRating) {
    await db.rating.update({
      where: {
        id: currentRating.id,
      },
      data: {
        value,
      },
    });
  } else {
    await db.rating.create({
      data: {
        value,
        gameId,
        gamePageId: targetGamePageId,
        userId,
        categoryId,
      },
    });
  }
}

export async function saveTrackRating({
  trackId,
  categoryId,
  value,
  userId,
  tenantId,
}: {
  trackId: number;
  categoryId: number;
  value: number;
  userId: number;
  tenantId?: string | null;
}) {
  const track = await db.gamePageTrack.findUnique({
    where: { id: trackId },
    include: {
      gamePage: {
        include: {
          game: {
            include: {
              team: {
                include: {
                  users: {
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!track || !track.gamePage?.game?.published) {
    throw new NotFoundError("Track not found");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: track.gamePage.game.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Track not found");
  }

  const category = await db.trackRatingCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true },
  });
  if (!category) {
    throw new NotFoundError("Rating category not found");
  }

  const isOwnTeam = track.gamePage.game.team.users.some(
    (member) => member.id === userId,
  );
  if (isOwnTeam) {
    throw new ForbiddenError("You can't rate your own track.");
  }

  const existing = await db.trackRating.findFirst({
    where: {
      trackId: track.id,
      userId,
      categoryId: category.id,
    },
  });

  if (existing) {
    await db.trackRating.update({
      where: { id: existing.id },
      data: { value },
    });
  } else {
    await db.trackRating.create({
      data: {
        trackId: track.id,
        userId,
        categoryId: category.id,
        value,
      },
    });
  }
}

export async function createTrackTimestampComment({
  trackId,
  content,
  timestamp,
  authorId,
  tenantId,
}: {
  trackId: number;
  content: string;
  timestamp: number;
  authorId: number;
  tenantId?: string | null;
}) {
  const track = await db.gamePageTrack.findUnique({
    where: { id: trackId },
    include: {
      gamePage: {
        select: {
          version: true,
          game: {
            select: { id: true, published: true },
          },
        },
      },
    },
  });

  if (!track || !track.gamePage?.game?.published) {
    throw new NotFoundError("Track not found");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: track.gamePage.game.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Track not found");
  }

  return db.trackTimestampComment.create({
    data: {
      trackId: track.id,
      authorId,
      content: content.trim(),
      timestamp,
    },
    include: {
      author: {
        select: {
          id: true,
          slug: true,
          name: true,
          profilePicture: true,
        },
      },
    },
  });
}

