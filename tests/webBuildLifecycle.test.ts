import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  deleteMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  updatePage: vi.fn(),
  transaction: vi.fn(),
  deletePrefix: vi.fn(),
}));

vi.mock("../src/infra/db.js", () => ({
  default: {
    $transaction: mocks.transaction,
    gamePage: { update: mocks.updatePage },
    webBuild: {
      aggregate: mocks.aggregate,
      deleteMany: mocks.deleteMany,
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("../src/infra/s3.js", () => ({
  IsUsingS3: vi.fn(async () => true),
  UploadS3File: vi.fn(),
  DeleteS3Prefix: mocks.deletePrefix,
}));

import {
  attachWebBuildToPage,
  assertWebBuildCanAttach,
  cleanupExpiredWebBuilds,
  scheduleWebBuildDeletionIfUnreferenced,
  withWebBuildProcessingSlot,
} from "../src/features/games/web-build.service.js";

const url = "/game-builds/12345678-1234-1234-1234-123456789abc/index.html";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      webBuild: { updateMany: mocks.updateMany },
      gamePage: { update: mocks.updatePage },
    }),
  );
});

describe("web build lifecycle", () => {
  it("claims and links a build in one transaction", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.updatePage.mockResolvedValue({});
    await attachWebBuildToPage(22, url);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deleteAfter: null }),
      }),
    );
    expect(mocks.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 22 } }),
    );
  });

  it("does not link a build after cleanup has leased it", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(attachWebBuildToPage(22, url)).rejects.toThrow(
      "no longer available",
    );
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("only allows the uploader to attach an active build", async () => {
    mocks.findUnique.mockResolvedValue({ ownerId: 4, deleteAfter: null });
    await expect(assertWebBuildCanAttach(url, 4)).resolves.toBeUndefined();
    await expect(assertWebBuildCanAttach(url, 5)).rejects.toThrow(
      "only attach web builds that you uploaded",
    );
  });

  it("does not allow a build already scheduled for deletion to be attached", async () => {
    mocks.findUnique.mockResolvedValue({ ownerId: 4, deleteAfter: new Date() });
    await expect(assertWebBuildCanAttach(url, 4)).rejects.toThrow(
      "only attach web builds that you uploaded",
    );
  });

  it("schedules deletion only when no game page references the build", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await scheduleWebBuildDeletionIfUnreferenced(
      "12345678-1234-1234-1234-123456789abc",
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gamePages: { none: {} } }),
      }),
    );
  });

  it("deletes due unreferenced storage and its database record", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findMany.mockResolvedValue([
      { id: "12345678-1234-1234-1234-123456789abc" },
    ]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.deletePrefix.mockResolvedValue(true);

    await expect(cleanupExpiredWebBuilds()).resolves.toBe(1);
    expect(mocks.deletePrefix).toHaveBeenCalledWith(
      "game-builds/12345678-1234-1234-1234-123456789abc/",
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ gamePages: { none: {} } }),
      }),
    );
  });

  it("caps expensive scanning and extraction work", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withWebBuildProcessingSlot(() => gate);
    const second = withWebBuildProcessingSlot(() => gate);
    await expect(
      withWebBuildProcessingSlot(async () => undefined),
    ).rejects.toThrow("processor is busy");
    release();
    await Promise.all([first, second]);
  });
});
