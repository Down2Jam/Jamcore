import { describe, expect, it } from "vitest";
import { toGameListingResponse } from "../src/features/games/listing.response.js";

describe("game listing response", () => {
  it("preserves card and rated-filter data without sending ranking history", () => {
    const rating = { id: 1, userId: 7, value: 8, categoryId: 2, gamePage: { version: "JAM" }, user: { teams: [{ game: { id: 123 } }] } };
    const game = {
      id: 12, slug: "example", name: "Example", pageVersion: "JAM",
      screenshots: ["screenshot.webp"], ratings: [rating], allRatings: [rating],
      team: { id: 4, name: "Team", ownerId: 7, owner: { id: 7, name: "Creator" }, users: [{ id: 7, ratings: [rating], scores: [{ value: 10 }], gamePageAchievements: [{ id: 8 }] }] },
    };
    const before = structuredClone(game);
    const result = toGameListingResponse(game as never);
    expect(result.id).toBe(12);
    expect(result).toMatchObject({ screenshots: game.screenshots });
    expect(result.team).toEqual({ ...game.team, users: [{ id: 7 }] });
    expect(result.ratings).toEqual([{ id: 1, userId: 7, value: 8, categoryId: 2, gamePage: { version: "JAM" } }]);
    expect(result.allRatings).toEqual(result.ratings);
    expect(game).toEqual(before);
  });

  it("supports unrated games without a team", () => {
    const result = toGameListingResponse({ id: 1, team: null } as never);
    expect(result.team).toBeNull();
    expect(result.ratings).toEqual([]);
    expect(result.allRatings).toEqual([]);
  });
});
