import { describe, expect, it } from "vitest";

import {
  EXTRA_GAME_CATEGORY,
  REGULAR_GAME_CATEGORY,
  buildJamScoreVisibilityTimeline,
  canChangeGameCategory,
  canViewGameScores,
  isAllowedJamRater,
} from "../src/domain/gamePolicies.js";
import { JAM_PHASES } from "../src/domain/jamTimeline.js";

describe("gamePolicies", () => {
  it("blocks jam-category changes during rating unless moving to EXTRA", () => {
    expect(
      canChangeGameCategory({
        jamPhase: JAM_PHASES.rating,
        targetPageVersion: "JAM",
        previousCategory: REGULAR_GAME_CATEGORY,
        nextCategory: REGULAR_GAME_CATEGORY,
      }),
    ).toBe(true);

    expect(
      canChangeGameCategory({
        jamPhase: JAM_PHASES.rating,
        targetPageVersion: "JAM",
        previousCategory: REGULAR_GAME_CATEGORY,
        nextCategory: "COOP",
      }),
    ).toBe(false);
  });

  it("recognizes eligible jam raters", () => {
    expect(
      isAllowedJamRater(
        { published: true, jamId: 3, category: REGULAR_GAME_CATEGORY },
        3,
      ),
    ).toBe(true);
    expect(
      isAllowedJamRater(
        { published: true, jamId: 3, category: EXTRA_GAME_CATEGORY },
        3,
      ),
    ).toBe(false);
  });

  it("shows scores after the rating phase ends", () => {
    const timeline = buildJamScoreVisibilityTimeline({
      startTime: "2024-01-01T00:00:00.000Z",
      suggestionHours: 1,
      slaughterHours: 1,
      votingHours: 1,
      jammingHours: 1,
      submissionHours: 1,
      ratingHours: 1,
    });

    expect(
      canViewGameScores({
        jamId: 10,
        currentJamId: 10,
        jamTimeline: timeline,
        now: new Date("2024-01-01T06:30:00.000Z"),
      }),
    ).toBe(true);
  });
});
