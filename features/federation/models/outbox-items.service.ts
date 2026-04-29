import { PageVersion } from "@prisma/client";

import { filterCoreEntityIdsByTenant } from "../../../infra/coreTenantStore.js";
import db from "../../../infra/db.js";
import { loadEmojiDefinitions } from "./emoji.service.js";

async function allowedIdSet({
  entityType,
  ids,
  tenantId,
}: {
  entityType: "Post" | "Game";
  ids: number[];
  tenantId?: string | null;
}) {
  return new Set(
    await filterCoreEntityIdsByTenant({
      entityType,
      ids: [...new Set(ids)],
      tenantId,
    }),
  );
}

async function filterOutboxItemsByTenant<
  P extends { id: number },
  C extends {
    postId?: number | null;
    game?: { id: number } | null;
    gamePage?: { game?: { id: number } | null } | null;
    track?: { gamePage?: { game?: { id: number } | null } | null } | null;
  },
  G extends { id: number },
  T extends { gamePage: { game: { id: number } } },
>({
  posts,
  comments,
  games,
  tracks,
  tenantId,
}: {
  posts: P[];
  comments: C[];
  games: G[];
  tracks: T[];
  tenantId?: string | null;
}) {
  const postIds = [
    ...posts.map((post) => post.id),
    ...comments
      .map((comment) => comment.postId)
      .filter((id): id is number => Number.isInteger(id)),
  ];
  const gameIds = [
    ...games.map((game) => game.id),
    ...tracks.map((track) => track.gamePage.game.id),
    ...comments
      .map((comment) =>
        comment.game?.id ??
        comment.gamePage?.game?.id ??
        comment.track?.gamePage?.game?.id ??
        null,
      )
      .filter((id): id is number => Number.isInteger(id)),
  ];

  const [allowedPostIds, allowedGameIds] = await Promise.all([
    allowedIdSet({ entityType: "Post", ids: postIds, tenantId }),
    allowedIdSet({ entityType: "Game", ids: gameIds, tenantId }),
  ]);

  return {
    posts: posts.filter((post) => allowedPostIds.has(post.id)),
    comments: comments.filter((comment) => {
      if (comment.postId) {
        return allowedPostIds.has(comment.postId);
      }
      const gameId =
        comment.game?.id ??
        comment.gamePage?.game?.id ??
        comment.track?.gamePage?.game?.id ??
        null;
      return typeof gameId === "number" && allowedGameIds.has(gameId);
    }),
    games: games.filter((game) => allowedGameIds.has(game.id)),
    tracks: tracks.filter((track) => allowedGameIds.has(track.gamePage.game.id)),
  };
}

export async function getJamOutboxItems(limit = 20, tenantId?: string | null) {
  const [posts, comments, games, tracks] = await Promise.all([
    db.post.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: {
        deletedAt: null,
        removedAt: null,
      },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { slug: true } },
      },
    }),
    db.comment.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: {
        postId: { not: null },
        deletedAt: null,
        removedAt: null,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        postId: true,
        commentId: true,
        author: { select: { slug: true } },
      },
    }),
    db.game.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: {
        published: true,
      },
      select: {
        id: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        category: true,
        team: {
          select: {
            owner: {
              select: { slug: true },
            },
          },
        },
        pages: {
          where: { version: PageVersion.JAM },
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
    }),
    db.gamePageTrack.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: {
        gamePage: {
          game: {
            published: true,
          },
        },
      },
      select: {
        slug: true,
        name: true,
        commentary: true,
        url: true,
        createdAt: true,
        updatedAt: true,
        composer: { select: { slug: true } },
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
    }),
  ]);
  const filtered = await filterOutboxItemsByTenant({
    posts,
    comments,
    games,
    tracks,
    tenantId,
  });

  const gameEmojis = await Promise.all(
    filtered.games.map(async (game) => ({
      slug: game.slug,
      emojis: await loadEmojiDefinitions([
        game.pages[0]?.description,
        game.pages[0]?.short,
      ]),
    })),
  );
  const trackEmojis = await Promise.all(
    filtered.tracks.map(async (track) => ({
      slug: track.slug,
      emojis: await loadEmojiDefinitions([track.commentary]),
    })),
  );

  return {
    posts: filtered.posts,
    comments: filtered.comments,
    games: filtered.games.map((game) => ({
      ...game,
      gamePage: game.pages[0] ?? null,
      emojis:
        gameEmojis.find((entry) => entry.slug === game.slug)?.emojis ?? [],
    })),
    tracks: filtered.tracks
      .filter((track) => track.gamePage.game.published)
      .map((track) => ({
        ...track,
        emojis:
          trackEmojis.find((entry) => entry.slug === track.slug)?.emojis ?? [],
      })),
  };
}

export async function getUserOutboxItems(
  slug: string,
  limit = 20,
  tenantId?: string | null,
) {
  const [posts, comments, games, tracks] = await Promise.all([
    db.post.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: { author: { slug }, deletedAt: null, removedAt: null },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { slug: true } },
      },
    }),
    db.comment.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: { author: { slug }, deletedAt: null, removedAt: null },
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        postId: true,
        commentId: true,
        author: { select: { slug: true } },
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
    }),
    db.game.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: {
        published: true,
        team: {
          owner: {
            slug,
          },
        },
      },
      select: {
        id: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        category: true,
        team: {
          select: {
            owner: {
              select: { slug: true },
            },
          },
        },
        pages: {
          where: { version: PageVersion.JAM },
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
    }),
    db.gamePageTrack.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      where: {
        composer: { slug },
        gamePage: {
          game: {
            published: true,
          },
        },
      },
      select: {
        slug: true,
        name: true,
        commentary: true,
        url: true,
        createdAt: true,
        updatedAt: true,
        composer: { select: { slug: true } },
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
      },
    }),
  ]);
  const filtered = await filterOutboxItemsByTenant({
    posts,
    comments,
    games,
    tracks,
    tenantId,
  });

  const gameEmojis = await Promise.all(
    filtered.games.map(async (game) => ({
      slug: game.slug,
      emojis: await loadEmojiDefinitions([
        game.pages[0]?.description,
        game.pages[0]?.short,
      ]),
    })),
  );
  const trackEmojis = await Promise.all(
    filtered.tracks.map(async (track) => ({
      slug: track.slug,
      emojis: await loadEmojiDefinitions([track.commentary]),
    })),
  );

  return {
    posts: filtered.posts,
    comments: filtered.comments.map((comment) => ({
      ...comment,
      gameSlug: comment.game?.slug ?? comment.gamePage?.game?.slug ?? null,
      trackSlug: comment.track?.slug ?? null,
    })),
    games: filtered.games.map((game) => ({
      ...game,
      gamePage: game.pages[0] ?? null,
      emojis:
        gameEmojis.find((entry) => entry.slug === game.slug)?.emojis ?? [],
    })),
    tracks: filtered.tracks.map((track) => ({
      ...track,
      emojis:
        trackEmojis.find((entry) => entry.slug === track.slug)?.emojis ?? [],
    })),
  };
}
