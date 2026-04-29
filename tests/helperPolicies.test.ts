import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { PageVersion } from "@prisma/client";

vi.mock("@infra/db", () => ({
  default: {
    comment: {
      findMany: vi.fn(),
    },
    notification: {
      deleteMany: vi.fn(),
    },
  },
}));

import {
  buildGamePagePayload,
  getGamePage,
  materializeGamePage,
} from "../features/games/page.helpers.js";
import { REGULAR_GAME_CATEGORY } from "../domain/gamePolicies.js";
import { mapCommentsForViewer } from "../features/comments/thread.service.js";

describe("typed helpers", () => {
  it("materializes a page-backed game view", () => {
    const game = {
      id: 1,
      slug: "game",
      pages: [
        {
          version: PageVersion.JAM,
          name: "Jam Name",
          description: "Desc",
          short: "Short",
          thumbnail: "thumb",
          banner: null,
          screenshots: [],
          trailerUrl: null,
          itchEmbedUrl: null,
          itchEmbedAspectRatio: null,
          inputMethods: [],
          estOneRun: null,
          estAnyPercent: null,
          estHundredPercent: null,
          themeJustification: "",
          emotePrefix: null,
          ratingCategories: [],
          majRatingCategories: [],
          flags: [],
          tags: [],
          downloadLinks: [],
          tracks: [],
          leaderboards: [],
          achievements: [],
          comments: [],
          ghosts: [],
          data: null,
        },
      ],
    };

    expect(getGamePage(game, PageVersion.JAM)?.version).toBe(PageVersion.JAM);
    expect((materializeGamePage(game) as { name?: string }).name).toBe("Jam Name");
  });

  it("normalizes page payload defaults", () => {
    expect(buildGamePagePayload({ name: "A" })).toEqual(
      expect.objectContaining({
        name: "A",
        screenshots: [],
        inputMethods: [],
      }),
    );
  });

  it("filters removed comments for non-privileged viewers", () => {
    const comments = mapCommentsForViewer(
      [
        {
          id: 1,
          removedAt: new Date(),
          likes: [],
          commentReactions: [],
          children: [],
        },
      ],
      null,
      false,
    );

    expect(comments).toEqual([]);
  });
});

