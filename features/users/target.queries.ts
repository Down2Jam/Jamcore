import db from "../../infra/db.js";
import { targetUserDetailSelect } from "../../prisma/selects.js";

export async function loadRawTargetUser(
  targetUserId?: number,
  targetUserSlug?: string,
) {
  if (targetUserId) {
    return db.user.findUnique({
      where: { id: targetUserId },
      select: targetUserDetailSelect,
    });
  }

  if (!targetUserSlug) {
    return null;
  }

  return db.user.findUnique({
    where: { slug: targetUserSlug },
    select: targetUserDetailSelect,
  });
}

export async function loadRecommendationUsers(
  currentUserId: number,
  activeJamId: number | null,
) {
  return db.user.findMany({
    where: { id: { not: currentUserId } },
    select: {
      id: true,
      slug: true,
      name: true,
      profilePicture: true,
      recommendedGameOverrideIds: true,
      recommendedGameHiddenIds: true,
      recommendedTrackOverrideIds: true,
      recommendedTrackHiddenIds: true,
      ratings: {
        where:
          activeJamId != null ? { game: { jamId: activeJamId } } : undefined,
        select: {
          gameId: true,
          categoryId: true,
          value: true,
          updatedAt: true,
          gamePage: {
            select: {
              version: true,
            },
          },
        },
      },
      trackRatings: {
        where:
          activeJamId != null
            ? {
                track: {
                  gamePage: {
                    game: {
                      jamId: activeJamId,
                    },
                  },
                },
              }
            : undefined,
        select: {
          trackId: true,
          categoryId: true,
          value: true,
          updatedAt: true,
        },
      },
    },
  });
}
