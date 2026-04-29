import { z } from "zod";

import db from "../../infra/db.js";
import { assertGameBelongsToTenant } from "../../lib/contentTenant.js";
import { NotFoundError } from "../../lib/errors.js";

export const achievementConnectionSchema = z.object({
  achievementId: z.coerce.number().int().positive(),
});

async function assertAchievementExists(
  achievementId: number,
  tenantId?: string | null,
) {
  const achievement = await db.gamePageAchievement.findFirst({
    where: {
      id: achievementId,
    },
    include: {
      gamePage: {
        select: {
          game: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!achievement) {
    throw new NotFoundError("No achievement exists with that id");
  }

  await assertGameBelongsToTenant(achievement.gamePage.game.id, tenantId);
}

export async function connectAchievementToUser({
  achievementId,
  userId,
  tenantId,
}: {
  achievementId: number;
  userId: number;
  tenantId?: string | null;
}) {
  await assertAchievementExists(achievementId, tenantId);

  await db.gamePageAchievement.update({
    where: {
      id: achievementId,
    },
    data: {
      users: {
        connect: { id: userId },
      },
    },
  });
}

export async function disconnectAchievementFromUser({
  achievementId,
  userId,
  tenantId,
}: {
  achievementId: number;
  userId: number;
  tenantId?: string | null;
}) {
  await assertAchievementExists(achievementId, tenantId);

  await db.gamePageAchievement.update({
    where: {
      id: achievementId,
    },
    data: {
      users: {
        disconnect: { id: userId },
      },
    },
  });
}

