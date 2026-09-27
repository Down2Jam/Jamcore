import { PageVersion } from "@prisma/client";

import { appConfig } from "../../config/app.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";
import { targetUserBaseSelect } from "../../prisma/selects.js";
import { materializeGamePage } from "../games/page.helpers.js";
import { materializeTrackPage } from "../tracks/page.js";
import { buildTargetUserRecommendations } from "./target.recommendations.js";
import { sortByIdOrder } from "./target.presenter.js";

const recapUserSelect = {
  ...targetUserBaseSelect,
  gamePageTracks: { select: { id: true } },
} as const;

function summaryGame(game: {
  id: number;
  slug: string;
  jamId: number;
  pages: Array<{
    version: PageVersion;
    name: string;
    thumbnail: string | null;
  }>;
}, version: PageVersion) {
  const page = game.pages.find((entry) => entry.version === version)
    ?? game.pages.find((entry) => entry.version === PageVersion.JAM);
  return {
    id: game.id,
    slug: game.slug,
    jamId: game.jamId,
    name: page?.name ?? game.slug,
    thumbnail: page?.thumbnail ?? null,
    pageVersion: version,
  };
}

export async function loadRecapUser({
  userSlug,
  jamId,
  tenantId,
}: {
  userSlug: string;
  jamId: number;
  tenantId?: string | null;
}) {
  const user = await db.user.findUnique({
    where: { slug: userSlug },
    select: recapUserSelect,
  });
  if (!user || !(await doesCoreEntityBelongToTenant({
    entityType: "User",
    entityId: user.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  }))) {
    throw new NotFoundError("User not found");
  }

  const [recommendations, comments, rawScores, rawAchievements] = await Promise.all([
    buildTargetUserRecommendations(user, { includeCandidates: false, jamId }),
    db.comment.findMany({
      where: {
        authorId: user.id,
        OR: [
          { game: { jamId } },
          { track: { gamePage: { game: { jamId } } } },
        ],
      },
      select: {
        id: true,
        game: { select: { id: true, jamId: true } },
        track: {
          select: {
            id: true,
            gamePage: { select: { game: { select: { jamId: true } } } },
          },
        },
      },
    }),
    db.score.findMany({
      where: { userId: user.id, leaderboard: { gamePage: { game: { jamId } } } },
      select: {
        id: true,
        data: true,
        userId: true,
        leaderboard: {
          select: {
            id: true,
            name: true,
            type: true,
            decimalPlaces: true,
            scores: { select: { userId: true, data: true } },
            gamePage: {
              select: {
                version: true,
                game: {
                  select: {
                    id: true,
                    slug: true,
                    jamId: true,
                    pages: {
                      where: { version: { in: [PageVersion.JAM, PageVersion.POST_JAM] } },
                      select: { version: true, name: true, thumbnail: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.gamePageAchievement.findMany({
      where: {
        users: { some: { id: user.id } },
        gamePage: { game: { jamId } },
      },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        gamePage: {
          select: {
            version: true,
            game: { select: { id: true, slug: true, jamId: true } },
          },
        },
      },
    }),
  ]);

  const achievementGameIds = [...new Set(rawAchievements.map((achievement) => achievement.gamePage.game.id))];
  const achievementGames = achievementGameIds.length
    ? await db.game.findMany({
        where: { id: { in: achievementGameIds } },
        select: {
          id: true,
          slug: true,
          jamId: true,
          ratings: { select: { userId: true } },
          pages: {
            where: { version: { in: [PageVersion.JAM, PageVersion.POST_JAM] } },
            select: {
              version: true,
              name: true,
              thumbnail: true,
              achievements: { select: { id: true, users: { select: { id: true } } } },
            },
          },
        },
      })
    : [];
  const achievementGameById = new Map(achievementGames.map((game) => [game.id, game]));

  const achievements = rawAchievements.map((achievement) => {
    const sourceGame = achievementGameById.get(achievement.gamePage.game.id);
    const version = achievement.gamePage.version === PageVersion.POST_JAM
      ? PageVersion.POST_JAM
      : PageVersion.JAM;
    const page = sourceGame?.pages.find((entry) => entry.version === version);
    const engagedIds = new Set(sourceGame?.ratings.map((rating) => rating.userId) ?? []);
    for (const entry of page?.achievements ?? []) {
      for (const unlockedBy of entry.users) engagedIds.add(unlockedBy.id);
    }
    const earnedUsers = page?.achievements.find((entry) => entry.id === achievement.id)?.users.length ?? 0;
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      image: achievement.image,
      game: summaryGame(sourceGame ?? {
        ...achievement.gamePage.game,
        pages: [],
      }, version),
      rarityEarnedUsers: earnedUsers,
      rarityEngagedUsers: engagedIds.size,
    };
  });

  const scores = rawScores.map((score) => {
    const { gamePage, ...board } = score.leaderboard;
    return {
      id: score.id,
      data: score.data,
      userId: score.userId,
      leaderboard: {
        ...board,
        game: summaryGame(gamePage.game, gamePage.version === PageVersion.POST_JAM
          ? PageVersion.POST_JAM : PageVersion.JAM),
      },
    };
  });

  return {
    id: user.id,
    slug: user.slug,
    name: user.name,
    teams: user.teams
      .filter((team) => team.game?.jamId === jamId)
      .map((team) => ({
        ...team,
        game: team.game
          ? materializeGamePage({ ...team.game, downloadLinks: team.game.downloadLinks ?? [] }, PageVersion.JAM)
          : null,
      })),
    comments: comments.map((comment) => ({
      id: comment.id,
      game: comment.game,
      track: comment.track ? {
        id: comment.track.id,
        game: { jamId: comment.track.gamePage.game.jamId },
      } : null,
    })),
    ratings: recommendations.ratings.filter((rating) => rating.game?.jamId === jamId),
    trackRatings: user.trackRatings.filter((rating) => rating.track?.gamePage?.game?.jamId === jamId),
    scores,
    achievements,
    recommendedGames: sortByIdOrder(recommendations.recommendedGames, recommendations.recommendedGameIds)
      .map((game) => materializeGamePage({ ...game, downloadLinks: game.downloadLinks ?? [] }, PageVersion.JAM))
      .filter((game) => game.jam?.id === jamId),
    recommendedTracks: sortByIdOrder(recommendations.recommendedTracks, recommendations.recommendedTrackIds)
      .map(materializeTrackPage)
      .filter((track) => track.game?.jamId === jamId),
    favoriteGameCounts: recommendations.favoriteGameCounts,
    favoriteTrackCounts: recommendations.favoriteTrackCounts,
  };
}
