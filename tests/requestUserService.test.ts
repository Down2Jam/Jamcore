import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadOptionalRequestUserBySlug,
  loadRequestUserBySlug,
} from "../features/users/request.service.js";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("../infra/db.js", () => ({
  default: {
    user: {
      findUnique,
    },
  },
}));

vi.mock("../features/games/page.helpers.js", () => ({
  materializeGamePage: (value: unknown) => value,
}));

vi.mock("../features/tracks/page.js", () => ({
  materializeTrackPage: (value: unknown) => value,
}));

describe("requestUserService", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("normalizes request-user ratings with page version metadata", async () => {
    findUnique.mockResolvedValue({
      id: 7,
      name: "Tester",
      bio: null,
      short: null,
      profilePicture: null,
      profileBackground: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      slug: "tester",
      mod: false,
      admin: false,
      emotePrefix: null,
      hideRatings: false,
      autoHideRatingsWhileStreaming: false,
      jams: [],
      receivedNotifications: [],
      bannerPicture: null,
      pronouns: null,
      links: [],
      linkLabels: [],
      email: null,
      twitch: null,
      primaryRoles: [],
      secondaryRoles: [],
      teams: [],
      teamInvites: [],
      ownedTeams: [],
      trackRatings: [],
      ratings: [
        {
          value: 8,
          userId: 7,
          gamePageId: 12,
          categoryId: 3,
          gamePage: {
            version: "POST_JAM",
            gameId: 55,
          },
        },
      ],
    });

    const user = await loadRequestUserBySlug("tester");

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "tester" },
      }),
    );
    expect(user?.ratings).toEqual([
      expect.objectContaining({
        gameId: 55,
        pageVersion: "POST_JAM",
      }),
    ]);
  });

  it("keeps optional request-user lookups nullable", async () => {
    findUnique.mockResolvedValue(null);

    await expect(loadOptionalRequestUserBySlug("missing")).resolves.toBeNull();
  });
});

