import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadOptionalRequestUserBySlug,
  loadRequestUserBySlug,
} from "../src/features/users/request.service.js";

const { findUnique, findComment } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findComment: vi.fn(),
}));

vi.mock("../src/infra/db.js", () => ({
  default: {
    comment: { findUnique: findComment },
    user: {
      findUnique,
    },
  },
}));

vi.mock("../src/features/games/page.helpers.js", () => ({
  materializeGamePage: (value: unknown) => value,
}));

vi.mock("../src/features/tracks/page.js", () => ({
  materializeTrackPage: (value: unknown) => value,
}));

describe("requestUserService", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findComment.mockReset();
  });

  it("repairs stored comment links in the inbox user response", async () => {
    findUnique.mockResolvedValue({ id: 7, receivedNotifications: [{ link: "/comments/8" }] });
    findComment.mockResolvedValue({ post: { id: 1, slug: "post" } });
    const user = await loadRequestUserBySlug("tester");
    expect(user?.receivedNotifications[0].link).toBe("/p/post?comment=8#comment-8");
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
          category: { always: false },
          gamePage: {
            version: "POST_JAM",
            gameId: 55,
            ratingCategories: [{ id: 3 }],
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

