import { describe, expect, it, vi } from "vitest";

vi.mock("../src/infra/s3.js", () => ({ GetS3File: vi.fn() }));

import {
  extractImageFilenameFromUrl,
  extractMusicFilenameFromUrl,
} from "../src/features/tracks/audio-download.js";

describe("download asset URLs", () => {
  it.each([
    "/api/v1/music/theme-song.mp3",
    "/api/v1/music/theme-song.mp3?version=2",
    "https://example.com/api/v1/music/theme-song.mp3",
  ])("extracts the uploaded music file from %s", (url) => {
    expect(extractMusicFilenameFromUrl(url)).toBe("theme-song.mp3");
  });

  it.each(["wav", "ogg", "mp3"])("supports relative %s uploads", (extension) => {
    expect(extractMusicFilenameFromUrl(`/api/v1/music/track.${extension}`))
      .toBe(`track.${extension}`);
  });

  it.each([
    "",
    "not a URL",
    "/api/v1/music/",
    "/api/v1/music/file.exe",
    "/api/v1/music/bad%2Fname.mp3",
    "/api/v1/music/bad%5Cname.mp3",
  ])("rejects invalid music paths: %s", (url) => {
    expect(extractMusicFilenameFromUrl(url)).toBeNull();
  });

  it.each([
    "/api/v1/image/cover.jpg",
    "https://example.com/api/v1/image/cover.jpg",
  ])("extracts cover art from %s", (url) => {
    expect(extractImageFilenameFromUrl(url)).toBe("cover.jpg");
  });

  it("rejects missing or invalid cover art", () => {
    expect(extractImageFilenameFromUrl(null)).toBeNull();
    expect(extractImageFilenameFromUrl("/api/v1/image/file.exe")).toBeNull();
  });
});
