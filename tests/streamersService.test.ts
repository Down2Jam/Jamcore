import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { axiosMock, dbMock } = vi.hoisted(() => ({
  axiosMock: {
    get: vi.fn(),
    post: vi.fn(),
  },
  dbMock: {
    featuredStreamer: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("axios", () => ({
  default: axiosMock,
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import {
  listFeaturedStreamers,
  updateFeaturedStreamers,
} from "../src/features/streamers";

describe("streamers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.featuredStreamer.findMany.mockResolvedValue([]);
    dbMock.featuredStreamer.create.mockResolvedValue({});
    dbMock.featuredStreamer.deleteMany.mockResolvedValue({ count: 0 });
    dbMock.user.findMany.mockResolvedValue([]);
    process.env.TWITCH_CLIENT_ID = "client-id";
    process.env.TWITCH_CLIENT_SECRET = "client-secret";
  });

  afterEach(() => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
  });

  it("lists featured streamers", async () => {
    dbMock.featuredStreamer.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const result = await listFeaturedStreamers();

    expect(dbMock.featuredStreamer.findMany).toHaveBeenCalledWith({
      orderBy: { id: "asc" },
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it("returns D2Jam-tagged streams before other featured streams", async () => {
    dbMock.featuredStreamer.findMany.mockResolvedValueOnce([
      { id: 1, streamTags: ["gamedev"], userName: "other" },
      { id: 2, streamTags: ["D2Jam"], userName: "priority" },
      { id: 3, streamTags: ["gamejam"], userName: "other-two" },
    ]);

    const result = await listFeaturedStreamers(true);

    expect(result.map((stream) => stream.userName)).toEqual([
      "priority",
      "other",
      "other-two",
    ]);
  });

  it.each([
    { tier1: 4, tier2: 3, tier3: 3, expected: [4, 0, 0] },
    { tier1: 3, tier2: 3, tier3: 3, expected: [3, 0, 0] },
    { tier1: 2, tier2: 3, tier3: 3, expected: [2, 1, 0] },
    { tier1: 1, tier2: 1, tier3: 3, expected: [1, 1, 1] },
    { tier1: 0, tier2: 4, tier3: 3, expected: [0, 3, 0] },
    { tier1: 0, tier2: 0, tier3: 4, expected: [0, 0, 3] },
    { tier1: 1, tier2: 0, tier3: 1, expected: [1, 0, 1] },
  ])(
    "fills three spots in tier order, allowing only tier 1 to exceed three: $tier1/$tier2/$tier3",
    async ({ tier1, tier2, tier3, expected }) => {
      const streams = [tier1, tier2, tier3].flatMap((count, tier) =>
        Array.from({ length: count }, (_, index) => ({
          user_name: `tier${tier + 1}-${index}`,
          thumbnail_url: "https://example.com/{width}x{height}.jpg",
          title: "Making a jam game",
          viewer_count: 10,
          language: "en",
          game_id: "1469308723",
          tags: tier === 0 ? ["D2Jam"] : ["gamedev"],
        })),
      );
      dbMock.user.findMany.mockResolvedValue(
        streams
          .filter((stream) => stream.user_name.startsWith("tier2-"))
          .map((stream) => ({ twitch: stream.user_name })),
      );
      axiosMock.post.mockResolvedValue({
        data: { access_token: "access-token" },
      });
      axiosMock.get.mockResolvedValue({ data: { data: streams } });

      await updateFeaturedStreamers();

      const selectedNames = dbMock.featuredStreamer.create.mock.calls.map(
        ([args]) => args.data.userName as string,
      );
      expect(
        [1, 2, 3].map(
          (tier) => selectedNames.filter((name) => name.startsWith(`tier${tier}-`)).length,
        ),
      ).toEqual(expected);
    },
  );

  it.each(["vibe code", "VIBE CODING", "Codex", "CLAUDE", "grok"])(
    "excludes titles containing %s from the fallback tier",
    async (excludedPhrase) => {
      axiosMock.post.mockResolvedValue({
        data: { access_token: "access-token" },
      });
      axiosMock.get.mockResolvedValue({
        data: {
          data: [
            {
              user_name: "excluded-streamer",
              thumbnail_url: "https://example.com/{width}x{height}.jpg",
              title: `Building with ${excludedPhrase} today`,
              viewer_count: 10_000,
              language: "en",
              game_id: "1469308723",
              tags: ["gamedev"],
            },
            {
              user_name: "fallback-streamer",
              thumbnail_url: "https://example.com/{width}x{height}.jpg",
              title: "Making a jam game",
              viewer_count: 0,
              language: "en",
              game_id: "1469308723",
              tags: ["gamedev"],
            },
          ],
          pagination: {},
        },
      });

      await updateFeaturedStreamers();

      expect(dbMock.featuredStreamer.create).toHaveBeenCalledTimes(1);
      expect(dbMock.featuredStreamer.create.mock.calls[0]?.[0].data.userName)
        .toBe("fallback-streamer");
    },
  );
});

