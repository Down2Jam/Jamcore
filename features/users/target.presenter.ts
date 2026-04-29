import { PageVersion } from "@prisma/client";

import { materializeGamePage } from "../games/page.helpers.js";
import { materializeTrackPage } from "../tracks/page.js";
import type { GameRatingLike } from "./recommendation.service.js";
import type {
  FavoriteGameCount,
  FavoriteTrackCount,
  TargetUserDetailRecord,
} from "../../types/user.js";

function materializeGameSummaryForVersion(
  game: {
    downloadLinks?: unknown[];
    pages?: Array<{ version: PageVersion }>;
  },
  version: PageVersion,
) {
  return materializeGamePage(
    {
      ...game,
      downloadLinks: game?.downloadLinks ?? [],
      pages: game?.pages ?? [],
    },
    version,
  );
}

export function sortByIdOrder<T extends { id: number }>(items: T[], ids: number[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => itemById.get(id))
    .filter((item): item is T => Boolean(item));
}

type PresentTargetUserArgs = {
  user: TargetUserDetailRecord;
  ratings: Array<GameRatingLike & { pageVersion: PageVersion }>;
  gameCandidates: Array<any>;
  recommendedGames: Array<any>;
  trackCandidates: Array<any>;
  recommendedTracks: Array<any>;
  gameCandidateIds: number[];
  recommendedGameIds: number[];
  trackCandidateIds: number[];
  recommendedTrackIds: number[];
  gameCandidateCount: number;
  trackCandidateCount: number;
  favoriteGameCounts: FavoriteGameCount[];
  favoriteTrackCounts: FavoriteTrackCount[];
};

export function presentTargetUser({
  user,
  ratings,
  gameCandidates,
  recommendedGames,
  trackCandidates,
  recommendedTracks,
  gameCandidateIds,
  recommendedGameIds,
  trackCandidateIds,
  recommendedTrackIds,
  gameCandidateCount,
  trackCandidateCount,
  favoriteGameCounts,
  favoriteTrackCounts,
}: PresentTargetUserArgs) {
  const normalizedScores = (user.scores ?? []).map((score: any) => ({
    ...score,
    leaderboard: score.leaderboard
      ? {
          ...score.leaderboard,
          game: score.leaderboard.gamePage?.game
            ? materializeGameSummaryForVersion(
                score.leaderboard.gamePage.game,
                score.leaderboard.gamePage.version === PageVersion.POST_JAM
                  ? PageVersion.POST_JAM
                  : PageVersion.JAM,
              )
            : null,
        }
      : null,
  }));

  const normalizedAchievements = (user.gamePageAchievements ?? []).map(
    (achievement: any) => {
      const pageVersion =
        achievement.gamePage?.version === PageVersion.POST_JAM
          ? PageVersion.POST_JAM
          : PageVersion.JAM;
      const pageGame = achievement.gamePage?.game ?? null;
      const game = pageGame
        ? materializeGameSummaryForVersion(pageGame, pageVersion)
        : null;
      const pageRecord =
        pageGame?.pages?.find((page: any) => page.version === pageVersion) ??
        null;
      const fullAchievement =
        pageRecord?.achievements?.find((entry: any) => entry.id === achievement.id) ??
        achievement;

      return {
        ...achievement,
        ...fullAchievement,
        game,
        pageVersion,
      };
    },
  );

  const normalizedTeams = (user.teams ?? []).map((team: any) => ({
    ...team,
    game: team.game
      ? materializeGameSummaryForVersion(team.game, PageVersion.JAM)
      : null,
  }));

  return {
    ...user,
    ratings,
    teams: normalizedTeams,
    tracks: (user.gamePageTracks ?? []).map(materializeTrackPage),
    scores: normalizedScores,
    achievements: normalizedAchievements,
    recommendedGames: sortByIdOrder(recommendedGames, recommendedGameIds).map(
      (game) => materializeGameSummaryForVersion(game, PageVersion.JAM),
    ),
    recommendedTracks: sortByIdOrder(
      recommendedTracks,
      recommendedTrackIds,
    ).map(materializeTrackPage),
    recommendedGameCandidates: sortByIdOrder(
      gameCandidates,
      gameCandidateIds,
    ).map((game) => materializeGameSummaryForVersion(game, PageVersion.JAM)),
    recommendedTrackCandidates: sortByIdOrder(
      trackCandidates,
      trackCandidateIds,
    ).map(materializeTrackPage),
    recommendedGameCandidateCount: gameCandidateCount,
    recommendedTrackCandidateCount: trackCandidateCount,
    favoriteGameCounts,
    favoriteTrackCounts,
  };
}
