import { beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock, getS3FileMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  getS3FileMock: vi.fn(),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: existsSyncMock,
  };
});

vi.mock("../src/infra/s3.js", () => ({
  GetS3File: getS3FileMock,
}));

import { NotFoundError } from "../src/lib/errors.js";
import { getStoredAssetByFilename } from "../src/features/uploads";

describe("uploads service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a local asset path when the file exists on disk", async () => {
    existsSyncMock.mockReturnValue(true);

    await expect(
      getStoredAssetByFilename({
        folder: "images",
        filename: "asset.png",
      }),
    ).resolves.toMatchObject({
      kind: "local",
    });
  });

  it("returns an S3 asset buffer when local storage misses", async () => {
    existsSyncMock.mockReturnValue(false);
    getS3FileMock.mockResolvedValue(Buffer.from("hello"));

    await expect(
      getStoredAssetByFilename({
        folder: "pfps",
        filename: "avatar.webp",
      }),
    ).resolves.toEqual({
      kind: "buffer",
      buffer: Buffer.from("hello"),
      contentType: "image/webp",
    });
  });

  it("throws when no local or remote asset exists", async () => {
    existsSyncMock.mockReturnValue(false);
    getS3FileMock.mockResolvedValue(null);

    await expect(
      getStoredAssetByFilename({
        folder: "images",
        filename: "missing.png",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

