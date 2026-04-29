import type { JamPhase, JamTimeline } from "./jamTimeline.js";
import { buildJamTimeline, JAM_PHASES } from "./jamTimeline.js";
import { appConfig } from "../config/app.js";

export const EXTRA_GAME_CATEGORY = appConfig.games.categories.extra;
export const REGULAR_GAME_CATEGORY = appConfig.games.categories.regular;
export const ODA_GAME_CATEGORY = appConfig.games.categories.oda;
export const OVERALL_RATING_CATEGORY_NAME =
  appConfig.games.ratingCategoryNames.overall;
export const GAME_CATEGORY_VALUES = [
  ODA_GAME_CATEGORY,
  REGULAR_GAME_CATEGORY,
  EXTRA_GAME_CATEGORY,
] as [string, string, string];

const POST_JAM_PHASES = new Set<JamPhase>([
  JAM_PHASES.postJamRefinement,
  JAM_PHASES.postJamRating,
]);

export function isExtraGameCategory(category: string | null | undefined) {
  return category === EXTRA_GAME_CATEGORY;
}

export function isPostJamPhase(phase: JamPhase | string | undefined) {
  return Boolean(phase && POST_JAM_PHASES.has(phase as JamPhase));
}

export function canChangeGameCategory({
  jamPhase,
  targetPageVersion,
  previousCategory,
  nextCategory,
}: {
  jamPhase?: JamPhase | string;
  targetPageVersion: "JAM" | "POST_JAM";
  previousCategory: string;
  nextCategory: string;
}) {
  if (previousCategory === nextCategory) {
    return true;
  }

  if (
    targetPageVersion === "JAM" &&
    jamPhase === JAM_PHASES.rating &&
    !isExtraGameCategory(nextCategory)
  ) {
    return false;
  }

  if (isPostJamPhase(jamPhase)) {
    return false;
  }

  return true;
}

export function isAllowedJamRater(
  candidateGame:
    | {
        published?: boolean | null;
        jamId?: number | null;
        category?: string | null;
      }
    | null
    | undefined,
  jamId: number,
) {
  return Boolean(
    candidateGame &&
      candidateGame.published &&
      candidateGame.jamId === jamId &&
      !isExtraGameCategory(candidateGame.category),
  );
}

export function canViewGameScores({
  jamId,
  currentJamId,
  jamTimeline,
  now = new Date(),
  recap,
  preview,
  isAdmin,
}: {
  jamId: number;
  currentJamId?: number;
  jamTimeline?: JamTimeline | null;
  now?: Date;
  recap?: unknown;
  preview?: unknown;
  isAdmin?: boolean;
}) {
  if (currentJamId !== jamId) {
    return true;
  }

  if (recap === "1") {
    return true;
  }

  if (preview === "1" && isAdmin) {
    return true;
  }

  if (!jamTimeline) {
    return true;
  }

  return now >= jamTimeline.ratingEnd;
}

export function buildJamScoreVisibilityTimeline(
  jam:
    | {
        startTime?: Date | string;
        suggestionHours?: number;
        slaughterHours?: number;
        votingHours?: number;
        jammingHours?: number;
        submissionHours?: number;
        ratingHours?: number;
        postJamRefinementHours?: number | null;
        postJamRatingHours?: number | null;
      }
    | null
    | undefined,
) {
  if (
    !jam?.startTime ||
    jam.suggestionHours == null ||
    jam.slaughterHours == null ||
    jam.votingHours == null ||
    jam.jammingHours == null ||
    jam.submissionHours == null ||
    jam.ratingHours == null
  ) {
    return null;
  }

  return buildJamTimeline({
    startTime: jam.startTime,
    suggestionHours: jam.suggestionHours,
    slaughterHours: jam.slaughterHours,
    votingHours: jam.votingHours,
    jammingHours: jam.jammingHours,
    submissionHours: jam.submissionHours,
    ratingHours: jam.ratingHours,
    postJamRefinementHours: jam.postJamRefinementHours,
    postJamRatingHours: jam.postJamRatingHours,
  });
}
