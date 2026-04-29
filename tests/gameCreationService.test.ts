import { describe, expect, it } from "vitest";

import { vi } from "vitest";

vi.mock("../infra/db.js", () => ({
  default: {},
}));

vi.mock("../features/mentions/notifications.service.js", () => ({
  notifyNewMentions: vi.fn(),
}));

import { REGULAR_GAME_CATEGORY } from "../domain/gamePolicies.js";
import { createGameSchema } from "../features/games/creation.service.js";

describe("game creation schema", () => {
  it("accepts a minimal valid payload", () => {
    const result = createGameSchema.safeParse({
      name: "Game",
      slug: "game",
      downloadLinks: [{ url: "https://example.com", platform: "Windows" }],
      category: REGULAR_GAME_CATEGORY,
      ratingCategories: [1],
      achievements: [],
      flags: [],
      tags: [],
      leaderboards: [],
      songs: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid itch embed aspect ratios", () => {
    const result = createGameSchema.safeParse({
      name: "Game",
      slug: "game",
      downloadLinks: [{ url: "https://example.com", platform: "Windows" }],
      category: REGULAR_GAME_CATEGORY,
      ratingCategories: [1],
      achievements: [],
      flags: [],
      tags: [],
      leaderboards: [],
      songs: [],
      itchEmbedAspectRatio: "15 / 9",
    });

    expect(result.success).toBe(false);
  });
});

