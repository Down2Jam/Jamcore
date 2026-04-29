import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, s3Mock, fsMock } = vi.hoisted(() => ({
  dbMock: {
    user: { findMany: vi.fn() },
    gamePage: { findMany: vi.fn() },
    gamePageAchievement: { findMany: vi.fn() },
    reaction: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
    flag: { findMany: vi.fn() },
    jam: { findMany: vi.fn() },
    teamRole: { findMany: vi.fn() },
    featuredStreamer: { findMany: vi.fn() },
  },
  s3Mock: {
    IsUsingS3: vi.fn(),
  },
  fsMock: {
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../infra/s3.js", () => ({
  IsUsingS3: s3Mock.IsUsingS3,
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: fsMock,
  };
});

import { listAdminImages } from "../features/admin-images";

describe("admin images service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mock.IsUsingS3.mockResolvedValue(false);
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.gamePage.findMany.mockResolvedValue([]);
    dbMock.gamePageAchievement.findMany.mockResolvedValue([]);
    dbMock.reaction.findMany.mockResolvedValue([]);
    dbMock.event.findMany.mockResolvedValue([]);
    dbMock.tag.findMany.mockResolvedValue([]);
    dbMock.flag.findMany.mockResolvedValue([]);
    dbMock.jam.findMany.mockResolvedValue([]);
    dbMock.teamRole.findMany.mockResolvedValue([]);
    dbMock.featuredStreamer.findMany.mockResolvedValue([]);
  });

  it("lists local images with usage counts", async () => {
    dbMock.user.findMany.mockResolvedValueOnce([
      {
        profilePicture: "/api/v1/image/avatar.png",
        bannerPicture: null,
        profileBackground: null,
      },
    ]);
    fsMock.readdir.mockResolvedValueOnce(["avatar.png"]);
    fsMock.stat.mockResolvedValueOnce({
      size: 123,
      mtimeMs: Date.now(),
      mtime: new Date("2026-04-22T00:00:00Z"),
    });

    const result = await listAdminImages();

    expect(result).toEqual(
      expect.objectContaining({
        totalFiles: 1,
        deletedCount: 0,
        files: [
          expect.objectContaining({
            name: "avatar.png",
            usageCount: 1,
          }),
        ],
      }),
    );
  });
});

