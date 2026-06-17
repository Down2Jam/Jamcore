import { describe, expect, it } from "vitest";

import {
  getFallbackJamPhase,
  getNextJamAfter,
  hasJoinedJam,
  shouldTreatJamAsUpcoming,
  sortJamsByStartTime,
} from "../src/domain/jamPolicies.js";
import { JAM_PHASES } from "../src/domain/jamTimeline.js";

describe("jamPolicies", () => {
  it("sorts jams by start time", () => {
    const sorted = sortJamsByStartTime([
      { id: 2, startTime: "2024-02-01T00:00:00.000Z" },
      { id: 1, startTime: "2024-01-01T00:00:00.000Z" },
    ]);

    expect(sorted.map((jam) => jam.id)).toEqual([1, 2]);
  });

  it("finds the next jam after a current one", () => {
    expect(
      getNextJamAfter(
        [
          { id: 1 },
          { id: 2 },
        ],
        1,
      ),
    ).toEqual({ id: 2 });
  });

  it("recognizes jam participation by slug", () => {
    expect(
      hasJoinedJam({
        userSlug: "ben",
        jamUsers: [{ slug: "ben" }, { slug: "sam" }],
      }),
    ).toBe(true);
    expect(
      hasJoinedJam({
        userSlug: "ben",
        jamUsers: [{ slug: "sam" }],
      }),
    ).toBe(false);
  });

  it("returns readable fallback phases", () => {
    expect(getFallbackJamPhase(true)).toBe(JAM_PHASES.upcoming);
    expect(getFallbackJamPhase(false)).toBe(JAM_PHASES.inactive);
  });

  it("marks jams as upcoming before post-jam rating ends", () => {
    expect(
      shouldTreatJamAsUpcoming({
        now: "2024-01-01T00:00:00.000Z",
        postJamRatingEnd: new Date("2024-01-02T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});
