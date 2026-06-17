import type { Prisma } from "@prisma/client";
import { PageVersion } from "@prisma/client";
import { z } from "zod";

import { appConfig } from "../../config/app.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { TTLCache } from "../../lib/cache.js";
import { jamAndPostJamVersions } from "../../prisma/selects.js";
import type { GameViewer, JamTimingContext } from "../../types/game.js";
import {
  isPrivilegedViewer,
  mapCommentsForViewer,
} from "../comments/thread.service.js";
import { listRemoteCommentsForTarget } from "../federation/remote-content.service.js";
import { buildVersionScores } from "./scoring.service.js";
import {
  getJamPage,
  getPostJamPage,
  getRatingPageVersion,
  postJamPageInclude,
} from "./page.service.js";
import {
  buildJamScoreVisibilityTimeline,
  canViewGameScores,
} from "./policies.js";

type GameDetailResponse = Record<string, unknown> | null;

const publicGameDetailCache = new TTLCache<GameDetailResponse>(20_000);

export function clearGameDetailCache() {
  publicGameDetailCache.clear();
}

const gameDetailInclude = {
  downloadLinks: true,
  ratingCategories: true,
  majRatingCategories: true,
  tags: true,
  flags: true,
  gameEmotes: {
    include: {
      artistUser: true,
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
      uploaderUser: true,
    },
  },
  pages: {
    where: {
      version: {
        in: jamAndPostJamVersions,
      },
    },
    include: postJamPageInclude,
  },
  team: {
    include: {
      owner: true,
      users: {
        include: {
          ratings: {
            select: {
              gamePage: {
                select: {
                  version: true,
                  gameId: true,
                  ratingCategories: {
                    select: {
                      id: true,
                    },
                  },
                  game: {
                    select: {
                      ratingCategories: {
                        select: {
                          id: true,
                        },
                      },
                      jamId: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  ratings: {
    include: {
      category: true,
      gamePage: {
        select: {
          id: true,
          version: true,
          gameId: true,
        },
      },
      user: {
        select: {
          teams: {
            select: {
              game: {
                select: {
                  jamId: true,
                  category: true,
                  published: true,
                  ratingCategories: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
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

type GameDetailRecord = Prisma.GameGetPayload<{
  include: typeof gameDetailInclude;
}>;

type NormalizedRating = GameDetailRecord["ratings"][number] & {
  gameId: number;
  gamePageId: number | null;
  pageVersion: PageVersion;
};

type NormalizedTeam = Omit<GameDetailRecord["team"], "users"> & {
  users: Array<
    Omit<GameDetailRecord["team"]["users"][number], "ratings"> & {
      ratings: Array<
        GameDetailRecord["team"]["users"][number]["ratings"][number] & {
          gameId: number | null;
          gamePageId: number | null;
          pageVersion: PageVersion;
          game: GameDetailRecord["team"]["users"][number]["ratings"][number]["gamePage"]["game"] | null;
        }
      >;
    }
  >;
};

export const gameDetailParamsSchema = z.object({
  gameSlug: z.string().trim().min(1),
});

export const gameDetailQuerySchema = z.object({
  recap: z.unknown().optional(),
  preview: z.unknown().optional(),
});

export async function loadGameDetailResponse({
  gameSlug,
  jam,
  viewer,
  tenantId,
  recap,
  preview,
}: {
  gameSlug: string;
  jam: JamTimingContext | undefined;
  viewer?: GameViewer | null;
  tenantId?: string | null;
  recap?: unknown;
  preview?: unknown;
}): Promise<GameDetailResponse> {
  const cacheKey =
    !viewer && !recap && !preview && jam?.id
      ? JSON.stringify({ gameSlug, jamId: jam.id, tenantId: tenantId ?? "default" })
      : null;

  const load = async (): Promise<GameDetailResponse> => {
    const game = await db.game.findUnique({
      where: { slug: gameSlug },
      include: gameDetailInclude,
    });

    if (!game) {
      return null;
    }

    const belongsToTenant = await doesCoreEntityBelongToTenant({
      entityType: "Game",
      entityId: game.id,
      tenantId,
      strictIsolation: appConfig.platform.multiTenant.strictIsolation,
    });
    if (!belongsToTenant) {
      return null;
    }

    const viewerUserId = viewer?.id ?? null;
    const privilegedViewer = isPrivilegedViewer(viewer);
    const commentsWithHasLiked = mapCommentsForViewer(
      game.comments,
      viewerUserId,
      privilegedViewer,
    );
    const remoteComments = await listRemoteCommentsForTarget({
      kind: "game",
      slug: game.slug,
      tenantId,
    });
    const jamPage = getJamPage(game);
    const postJamPage = getPostJamPage(game);
    const jamPageCommentsWithHasLiked = mapCommentsForViewer(
      jamPage?.comments ?? [],
      viewerUserId,
      privilegedViewer,
    );
    const postJamPageCommentsWithHasLiked = mapCommentsForViewer(
      postJamPage?.comments ?? [],
      viewerUserId,
      privilegedViewer,
    );

    const canShowScores = canViewGameScores({
      jamId: game.jamId,
      currentJamId: jam?.id,
      jamTimeline: buildJamScoreVisibilityTimeline(jam),
      recap,
      preview,
      isAdmin: Boolean(viewer?.admin),
    });

    let jamScores = {};
    let postJamScores = {};

    if (canShowScores) {
      jamScores = await buildVersionScores({
        game,
        version: PageVersion.JAM,
      });

      if (postJamPage && game.published) {
        postJamScores = await buildVersionScores({
          game,
          version: PageVersion.POST_JAM,
        });
      }
    }

    const normalizedRatings: NormalizedRating[] = (game.ratings ?? []).map((rating) => ({
      ...rating,
      gameId: rating.gamePage?.gameId ?? game.id,
      gamePageId: rating.gamePage?.id ?? null,
      pageVersion: getRatingPageVersion(rating),
    }));

    const normalizedTeam: NormalizedTeam = {
      ...game.team,
      users: (game.team?.users ?? []).map((teamUser) => ({
        ...teamUser,
        ratings: (teamUser.ratings ?? []).map((rating) => ({
          ...rating,
          gameId: rating.gamePage?.gameId ?? null,
          gamePageId: null,
          pageVersion: getRatingPageVersion(rating),
          game: rating.gamePage?.game ?? null,
        })),
      })),
    };

    return {
      ...game,
      achievements: jamPage?.achievements ?? [],
      leaderboards: jamPage?.leaderboards ?? [],
      gameEmotes: (game.gameEmotes ?? []).map((emoji) => ({
        ...emoji,
        ownerGame: emoji.ownerGame
          ? {
              ...emoji.ownerGame,
              name: emoji.ownerGame.pages?.[0]?.name ?? emoji.ownerGame.slug,
              thumbnail: emoji.ownerGame.pages?.[0]?.thumbnail ?? null,
            }
          : null,
      })),
      team: normalizedTeam,
      ratings: normalizedRatings,
      jamPage: jamPage
        ? {
            ...jamPage,
            comments: jamPageCommentsWithHasLiked,
          }
        : null,
      postJamPage: postJamPage
        ? {
            ...postJamPage,
            comments: postJamPageCommentsWithHasLiked,
          }
        : null,
      comments: [...commentsWithHasLiked, ...remoteComments],
      jamScores,
      postJamScores,
    };
  };

  if (cacheKey) {
    return publicGameDetailCache.getOrSet(cacheKey, load);
  }

  return load();
}
