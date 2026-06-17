import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    featuredStreamer: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { listFeaturedStreamers } from "../src/features/streamers";

describe("streamers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists featured streamers", async () => {
    dbMock.featuredStreamer.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const result = await listFeaturedStreamers();

    expect(dbMock.featuredStreamer.findMany).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 1 }]);
  });
});

