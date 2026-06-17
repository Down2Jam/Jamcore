import { LeaderboardType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildPostJamBodyFromGame,
  buildPrefix,
} from "../src/features/games/page.service.js";

describe("gamePageService", () => {
  it("builds a normalized emote prefix from a slug seed", () => {
    expect(buildPrefix("My Cool Game!")).toBe("mycool");
  });

  it("materializes post-jam write data from the jam page", () => {
    const payload = buildPostJamBodyFromGame({
      pages: [
        {
          id: 10,
          gameId: 11,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: "JAM",
          thumbnail: null,
          banner: null,
          trailerUrl: null,
          itchEmbedUrl: null,
          itchEmbedAspectRatio: null,
          inputMethods: [],
          estOneRun: null,
          estAnyPercent: null,
          estHundredPercent: null,
          themeJustification: "",
          emotePrefix: null,
          name: "Jam Name",
          description: "Desc",
          short: "Short",
          screenshots: ["a"],
          ratingCategories: [{ id: 1, name: "Cat", description: null, createdAt: new Date(), updatedAt: new Date(), askMajorityContent: false, order: 0, always: false }],
          majRatingCategories: [{ id: 2, name: "Maj", description: null, createdAt: new Date(), updatedAt: new Date(), askMajorityContent: false, order: 0, always: false }],
          flags: [{ id: 3, name: "Flag", icon: "icon", description: null, createdAt: new Date(), updatedAt: new Date() }],
          tags: [{ id: 4, name: "Tag", icon: null, description: null, createdAt: new Date(), updatedAt: new Date(), categoryId: null, autoRegex: null, alwaysAdded: false, priority: "LOW", modOnly: false, gameTag: true, postTag: false }],
          achievements: [{ id: 6, name: "Ach", description: "D", image: "img", createdAt: new Date(), updatedAt: new Date(), gamePageId: 10, users: [] }],
          leaderboards: [{ id: 5, name: "LB", type: LeaderboardType.SCORE, onlyBest: false, maxUsersShown: 10, decimalPlaces: 0, gamePageId: 10, createdAt: new Date(), updatedAt: new Date(), scores: [] }],
          downloadLinks: [{ id: 7, url: "u", platform: "WEB", gamePageId: 10 }],
          comments: [],
          tracks: [{ id: 8, name: "Song", slug: "song", url: "song.mp3", commentary: null, bpm: null, musicalKey: null, softwareUsed: [], license: null, allowDownload: false, allowBackgroundUse: false, allowBackgroundUseAttribution: false, composerId: 1, gamePageId: 10, createdAt: new Date(), updatedAt: new Date(), tags: [], flags: [], links: [], credits: [], composer: { id: 1 } as never }],
        },
      ],
    });

    expect(payload).toEqual(
      expect.objectContaining({
        name: "Jam Name",
        ratingCategories: [1],
        songs: [expect.objectContaining({ slug: "song" })],
      }),
    );
  });
});
