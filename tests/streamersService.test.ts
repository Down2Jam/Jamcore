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

    expect(dbMock.featuredStreamer.findMany).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 1 }]);
  });

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

