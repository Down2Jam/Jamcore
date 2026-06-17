import { describe, expect, it } from "vitest";

import { JAM_PHASES, buildJamTimeline, getJamPhase } from "../src/domain/jamTimeline.js";

const jam = {
  startTime: "2026-05-10T12:00:00.000Z",
  suggestionHours: 24,
  slaughterHours: 12,
  votingHours: 12,
  jammingHours: 48,
  submissionHours: 24,
  ratingHours: 24,
  postJamRefinementHours: 24,
  postJamRatingHours: 24,
};

describe("jam timeline", () => {
  it("builds the expected milestone order", () => {
    const timeline = buildJamTimeline(jam);

    expect(timeline.startOfSuggestions.toISOString()).toBe(
      "2026-05-08T12:00:00.000Z",
    );
    expect(timeline.suggestionEnd < timeline.slaughterEnd).toBe(true);
    expect(timeline.ratingEnd < timeline.postJamRefinementEnd).toBe(true);
  });

  it("returns the active phase for a given timestamp", () => {
    expect(getJamPhase(jam, "2026-05-08T20:00:00.000Z")).toBe(JAM_PHASES.suggestion);
    expect(getJamPhase(jam, "2026-05-09T18:00:00.000Z")).toBe(JAM_PHASES.elimination);
    expect(getJamPhase(jam, "2026-05-12T13:00:00.000Z")).toBe(JAM_PHASES.submission);
    expect(getJamPhase(jam, "2026-05-14T13:00:00.000Z")).toBe(
      JAM_PHASES.postJamRefinement,
    );
  });
});
