import { PageVersion } from "@prisma/client";

import { appConfig } from "../../../config/app.js";
import db from "../../../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../../../infra/coreTenantStore.js";
import { NotFoundError } from "../../../lib/errors.js";
import { loadEmojiDefinitions } from "./emoji.service.js";

async function assertFederatedGameTenant(gameId: number, tenantId?: string | null) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: gameId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Federated object not found");
  }
}

async function assertFederatedPostTenant(postId: number, tenantId?: string | null) {
  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Post",
    entityId: postId,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Federated object not found");
  }
}

export async function getFederatedPostById(
  id: number,
  tenantId?: string | null,
) {
  const post = await db.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      deletedAt: true,
      removedAt: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!post || post.deletedAt || post.removedAt) {
    throw new NotFoundError("Federated post not found");
  }

  await assertFederatedPostTenant(post.id, tenantId);

  const collaborators = (await db.$queryRawUnsafe(
    `
      SELECT u.slug
      FROM "PostCollaborator" pc
      JOIN "User" u ON u.id = pc.user_id
      WHERE pc.post_id = $1 AND pc.status = 'accepted'
      ORDER BY pc.created_at ASC
    `,
    post.id,
  ).catch(() => [])) as Array<{ slug: string }>;

  return {
    ...post,
    collaborators,
  };
}

export async function getFederatedCommentById(
  id: number,
  tenantId?: string | null,
) {
  const comment = await db.comment.findUnique({
    where: { id },
    select: {
      id: true,
      content: true,
      deletedAt: true,
      removedAt: true,
      createdAt: true,
      updatedAt: true,
      commentId: true,
      postId: true,
      author: {
        select: {
          slug: true,
        },
      },
      game: {
        select: {
          id: true,
          slug: true,
        },
      },
      gamePage: {
        select: {
          game: {
            select: {
              id: true,
              slug: true,
            },
          },
        },
      },
      track: {
        select: {
          slug: true,
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
      },
    },
  });

  if (!comment || comment.deletedAt || comment.removedAt) {
    throw new NotFoundError("Federated comment not found");
  }

  if (comment.postId) {
    await assertFederatedPostTenant(comment.postId, tenantId);
  } else {
    const gameId =
      comment.game?.id ??
      comment.gamePage?.game?.id ??
      comment.track?.gamePage?.game?.id ??
      null;
    if (gameId) {
      await assertFederatedGameTenant(gameId, tenantId);
    }
  }

  return {
    ...comment,
    gameSlug: comment.game?.slug ?? comment.gamePage?.game?.slug ?? null,
    trackSlug: comment.track?.slug ?? null,
  };
}

export async function getFederatedGameBySlug(
  slug: string,
  tenantId?: string | null,
) {
  const game = await db.game.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      published: true,
      createdAt: true,
      updatedAt: true,
      category: true,
      team: {
        select: {
          owner: {
            select: {
              slug: true,
            },
          },
        },
      },
      pages: {
        where: {
          version: PageVersion.JAM,
        },
        take: 1,
        select: {
          name: true,
          description: true,
          short: true,
          screenshots: true,
          thumbnail: true,
          trailerUrl: true,
        },
      },
    },
  });

  if (!game || !game.published) {
    throw new NotFoundError("Federated game not found");
  }

  await assertFederatedGameTenant(game.id, tenantId);

  const gamePage = game.pages[0] ?? null;
  const emojis = await loadEmojiDefinitions([gamePage?.description, gamePage?.short]);

  return {
    ...game,
    gamePage,
    emojis,
  };
}

export async function getFederatedTrackBySlug(
  slug: string,
  tenantId?: string | null,
) {
  const track = await db.gamePageTrack.findFirst({
    where: {
      slug,
      gamePage: {
        game: {
          published: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      slug: true,
      name: true,
      commentary: true,
      url: true,
      createdAt: true,
      updatedAt: true,
      composer: {
        select: {
          slug: true,
        },
      },
      gamePage: {
        select: {
          game: {
            select: {
              id: true,
              slug: true,
              published: true,
            },
          },
        },
      },
    },
  });

  if (!track || !track.gamePage?.game?.published) {
    throw new NotFoundError("Federated track not found");
  }

  await assertFederatedGameTenant(track.gamePage.game.id, tenantId);

  const emojis = await loadEmojiDefinitions([track.commentary]);

  return {
    ...track,
    emojis,
  };
}
