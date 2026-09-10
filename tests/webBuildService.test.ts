import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/infra/s3.js", () => ({
  IsUsingS3: vi.fn(async () => false),
  UploadS3File: vi.fn(),
  DeleteS3Prefix: vi.fn(),
}));

import {
  resolveWebBuildAsset,
  storeWebBuildArchive,
  validateWebBuildEntries,
} from "../src/features/games/web-build.service.js";

const createdBuilds: string[] = [];
const minimalWebBuild = Buffer.from(
  "UEsDBBQAAAAIAPMBKl2Ys/rxJAAAACAAAAAKAAAAaW5kZXguaHRtbLJRTMlPLqksSFXIKMnNsbMpySzJSbXLz7bRh7AAAAAA//8DAFBLAQIUABQAAAAIAPMBKl2Ys/rxJAAAACAAAAAKAAAAAAAAAAAAAAAAAAAAAABpbmRleC5odG1sUEsFBgAAAAABAAEAOAAAAEwAAAAAAA==",
  "base64",
);

afterEach(async () => {
  for (const buildId of createdBuilds.splice(0)) {
    await fs.rm(path.resolve(process.cwd(), "public", "game-builds", buildId), {
      recursive: true,
      force: true,
    });
  }
});

describe("web build storage", () => {
  it("accepts a ZIP with a root index and extracts it under an opaque id", async () => {
    const result = await storeWebBuildArchive(minimalWebBuild);
    createdBuilds.push(result.buildId);

    expect(result.playableUrl).toBe(`/game-builds/${result.buildId}/index.html`);
    const stored = resolveWebBuildAsset(result.buildId, "index.html");
    expect(await fs.readFile(stored!.path, "utf8")).toContain("<title>ok</title>");
  });

  it("rejects content that is not a ZIP", async () => {
    await expect(storeWebBuildArchive(Buffer.from("not a zip"))).rejects.toThrow(
      "not a valid ZIP",
    );
  });

  it("does not resolve traversal paths", () => {
    expect(() => resolveWebBuildAsset("12345678-1234-1234-1234-123456789abc", "../secret"))
      .toThrow("unsafe file path");
  });

  it("accepts a build wrapped in one root folder", () => {
    expect(
      validateWebBuildEntries([
        { fileName: "game/index.html", uncompressedSize: 20 },
        { fileName: "game/assets/main.js", uncompressedSize: 20 },
      ]).outputNames,
    ).toEqual(["index.html", "assets/main.js"]);
  });

  it.each([
    {
      name: "traversal paths",
      entries: [{ fileName: "../index.html", uncompressedSize: 1 }],
      message: "unsafe file path",
    },
    {
      name: "duplicate paths",
      entries: [
        { fileName: "index.html", uncompressedSize: 1 },
        { fileName: "index.html", uncompressedSize: 1 },
      ],
      message: "duplicate file paths",
    },
    {
      name: "missing entry point",
      entries: [{ fileName: "main.js", uncompressedSize: 1 }],
      message: "index.html",
    },
    {
      name: "executable files",
      entries: [
        { fileName: "index.html", uncompressedSize: 1 },
        { fileName: "setup.exe", uncompressedSize: 1 },
      ],
      message: ".exe files",
    },
    {
      name: "oversized individual files",
      entries: [
        { fileName: "index.html", uncompressedSize: 1 },
        { fileName: "data.bin", uncompressedSize: 201 * 1024 * 1024 },
      ],
      message: "larger than 200 MB",
    },
    {
      name: "oversized expanded archives",
      entries: [
        { fileName: "index.html", uncompressedSize: 200 * 1024 * 1024 },
        { fileName: "one.bin", uncompressedSize: 200 * 1024 * 1024 },
        { fileName: "two.bin", uncompressedSize: 101 * 1024 * 1024 },
      ],
      message: "expanded web build is too large",
    },
  ])("rejects $name", ({ entries, message }) => {
    expect(() => validateWebBuildEntries(entries)).toThrow(message);
  });

  it("rejects archives with more than 1,000 entries", () => {
    const entries = Array.from({ length: 1_001 }, (_, index) => ({
      fileName: index === 0 ? "index.html" : `assets/${index}.txt`,
      uncompressedSize: 1,
    }));
    expect(() => validateWebBuildEntries(entries)).toThrow("too many files");
  });
});
