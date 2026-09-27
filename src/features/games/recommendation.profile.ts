import { PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { isActiveGameRating } from "../ratings/active.js";
import type { PreferenceExample, PreferenceGame } from "./recommendation.personalization.js";

const teamSelect = {
  ownerId: true,
  owner: { select: { id: true, name: true } },
  users: { select: { id: true, name: true } },
} as const;

const pageSelect = {
  version: true,
  tags: { select: { id: true, name: true, alwaysAdded: true } },
  inputMethods: true,
  downloadLinks: { select: { platform: true } },
  playableBuildUrl: true,
  itchEmbedUrl: true,
  estOneRun: true,
  achievements: { select: { id: true } },
  leaderboards: { select: { id: true } },
  ratingCategories: { select: { id: true } },
} as const;

function toPreferenceGame(
  page: Omit<NonNullable<Awaited<ReturnType<typeof loadRatingPages>>[number]["gamePage"]>, "game">,
  team: PreferenceGame["team"],
): PreferenceGame {
  return {
    tags: page.tags,
    inputMethods: page.inputMethods,
    downloadLinks: page.downloadLinks,
    playableBuildUrl: page.playableBuildUrl,
    itchEmbedUrl: page.itchEmbedUrl,
    estOneRun: page.estOneRun,
    achievements: page.achievements,
    leaderboards: page.leaderboards,
    team,
  };
}

async function loadRatingPages(viewerId: number, overallCategoryId: number) {
  return db.rating.findMany({
    where: { userId: viewerId, categoryId: overallCategoryId },
    select: {
      gameId: true,
      categoryId: true,
      category: { select: { always: true } },
      value: true,
      updatedAt: true,
      gamePage: {
        select: {
          ...pageSelect,
          game: { select: { team: { select: teamSelect } } },
        },
      },
    },
  });
}

export async function loadPreferenceExamples(
  viewerId: number,
  overallCategoryId: number | null,
  tenantId?: string | null,
): Promise<PreferenceExample[]> {
  const [user, ratings] = await Promise.all([
    db.user.findUnique({
      where: { id: viewerId },
      select: {
        updatedAt: true,
        recommendedGameOverrideIds: true,
        recommendedGameHiddenIds: true,
      },
    }),
    overallCategoryId ? loadRatingPages(viewerId, overallCategoryId) : Promise.resolve([]),
  ]);
  if (!user) return [];

  const pickedIds = user.recommendedGameOverrideIds.filter(
    (id) => !user.recommendedGameHiddenIds.includes(id),
  );
  const allowedIds = new Set(await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [...new Set([...pickedIds, ...ratings.map((rating) => rating.gameId)])],
    tenantId,
  }));
  const examplesByGame = new Map<number, PreferenceExample>();

  ratings.forEach((rating) => {
    if (!allowedIds.has(rating.gameId) || !isActiveGameRating(rating)) return;
    const previous = examplesByGame.get(rating.gameId);
    if (previous && previous.updatedAt >= rating.updatedAt) return;
    examplesByGame.set(rating.gameId, {
      game: toPreferenceGame(rating.gamePage, rating.gamePage.game.team),
      value: rating.value,
      updatedAt: rating.updatedAt,
      picked: false,
    });
  });

  const validPickedIds = pickedIds.filter((id) => allowedIds.has(id));
  if (validPickedIds.length === 0) return [...examplesByGame.values()];

  const pickedGames = await db.game.findMany({
    where: { id: { in: validPickedIds }, published: true },
    select: {
      id: true,
      team: { select: teamSelect },
      pages: {
        where: { version: PageVersion.JAM },
        select: pageSelect,
        take: 1,
      },
    },
  });
  pickedGames.forEach((game) => {
    const page = game.pages[0];
    if (!page) return;
    examplesByGame.set(game.id, {
      game: toPreferenceGame(page, game.team),
      value: 10,
      updatedAt: user.updatedAt,
      picked: true,
    });
  });

  return [...examplesByGame.values()];
}
