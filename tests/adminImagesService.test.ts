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
    post: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    documentationDocument: { findMany: vi.fn() },
    gamePageTrack: { findMany: vi.fn() },
    collectionComment: { findMany: vi.fn() },
    collection: { findMany: vi.fn() },
    postRevision: { findMany: vi.fn() },
    postAutosave: { findMany: vi.fn() },
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

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/infra/s3.js", () => ({
  IsUsingS3: s3Mock.IsUsingS3,
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: fsMock,
  };
});

import { listAdminImages } from "../src/features/admin-images";

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
    dbMock.post.findMany.mockResolvedValue([]);
    dbMock.comment.findMany.mockResolvedValue([]);
    dbMock.documentationDocument.findMany.mockResolvedValue([]);
    dbMock.gamePageTrack.findMany.mockResolvedValue([]);
    dbMock.collectionComment.findMany.mockResolvedValue([]);
    dbMock.collection.findMany.mockResolvedValue([]);
    dbMock.postRevision.findMany.mockResolvedValue([]);
    dbMock.postAutosave.findMany.mockResolvedValue([]);
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

  it("does not delete images embedded in rich text", async () => {
    const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;
    dbMock.post.findMany.mockResolvedValueOnce([
      {
        content:
          'A post with <img src="/api/v1/image/embedded.png"> and ![](/api/v1/image/second.webp)',
      },
    ]);
    fsMock.readdir.mockResolvedValueOnce(["embedded.png", "second.webp"]);
    fsMock.stat.mockResolvedValue({
      size: 123,
      mtimeMs: oldTimestamp,
      mtime: new Date(oldTimestamp),
    });

    const result = await listAdminImages();

    expect(result.files).toEqual([
      expect.objectContaining({ name: "embedded.png", usageCount: 1 }),
      expect.objectContaining({ name: "second.webp", usageCount: 1 }),
    ]);
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });
});

