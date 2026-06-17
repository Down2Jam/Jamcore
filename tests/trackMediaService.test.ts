import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageVersion } from "@prisma/client";

const { dbMock, audioMock } = vi.hoisted(() => ({
  dbMock: {
    gamePageTrack: {
      findFirst: vi.fn(),
    },
  },
  audioMock: {
    buildTrackDownloadFilename: vi.fn(() => "Theme Song.mp3"),
    createContentDisposition: vi.fn(() => 'attachment; filename="Theme Song.mp3"'),
    detectAudioFormat: vi.fn(() => "mp3"),
    embedTrackDownloadMetadata: vi.fn((buffer) => buffer),
    extractMusicFilenameFromUrl: vi.fn(() => "theme-song.mp3"),
    getContentTypeForAudioFormat: vi.fn(() => "audio/mpeg"),
    getEmbeddedCoverArt: vi.fn(async () => null),
    getMusicContentType: vi.fn(() => "audio/mpeg"),
    getMusicFileBuffer: vi.fn(),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/infra/coreTenantStore.js", () => ({
  doesCoreEntityBelongToTenant: vi.fn(async () => true),
}));

vi.mock("../src/features/tracks/audio-download.js", () => ({
  buildTrackDownloadFilename: audioMock.buildTrackDownloadFilename,
  createContentDisposition: audioMock.createContentDisposition,
  detectAudioFormat: audioMock.detectAudioFormat,
  embedTrackDownloadMetadata: audioMock.embedTrackDownloadMetadata,
  extractMusicFilenameFromUrl: audioMock.extractMusicFilenameFromUrl,
  getContentTypeForAudioFormat: audioMock.getContentTypeForAudioFormat,
  getEmbeddedCoverArt: audioMock.getEmbeddedCoverArt,
  getMusicContentType: audioMock.getMusicContentType,
  getMusicFileBuffer: audioMock.getMusicFileBuffer,
}));

vi.mock("../src/features/tracks/page.js", () => ({
  parseTrackPageVersion: vi.fn((value) =>
    value === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM,
  ),
}));

import { BadRequestError, NotFoundError } from "../src/lib/errors.js";
import {
  buildTrackDownloadBySlug,
  getMusicFileByName,
} from "../src/features/tracks/media.service.js";

describe("track media service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a named music file and returns its content type", async () => {
    audioMock.getMusicFileBuffer.mockResolvedValueOnce(Buffer.from("music"));
    dbMock.gamePageTrack.findFirst.mockResolvedValueOnce({
      gamePage: {
        game: {
          id: 1,
        },
      },
    });

    const file = await getMusicFileByName("theme-song.mp3");

    expect(file).toEqual({
      buffer: Buffer.from("music"),
      contentType: "audio/mpeg",
    });
  });

  it("rejects invalid filenames", async () => {
    await expect(getMusicFileByName("../bad.mp3")).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("builds a downloadable track file with metadata", async () => {
    audioMock.getMusicFileBuffer.mockResolvedValueOnce(Buffer.from("track"));
    dbMock.gamePageTrack.findFirst.mockResolvedValueOnce({
      name: "Theme Song",
      url: "https://example.com/music/theme-song.mp3",
      bpm: 120,
      musicalKey: "C",
      license: "CC-BY",
      createdAt: new Date("2026-04-01T00:00:00Z"),
      gamePage: {
        version: PageVersion.JAM,
        name: "Theme Game",
        thumbnail: null,
        banner: null,
        game: {
          id: 1,
          slug: "theme-game",
          published: true,
          jam: {
            startTime: new Date("2026-04-01T00:00:00Z"),
          },
        },
      },
      credits: [],
      tags: [],
      composer: {
        name: "Composer",
        slug: "composer",
      },
    });

    const file = await buildTrackDownloadBySlug({
      trackSlug: "theme-song",
      pageVersionInput: undefined,
    });

    expect(file).toEqual({
      buffer: Buffer.from("track"),
      contentType: "audio/mpeg",
      contentDisposition: 'attachment; filename="Theme Song.mp3"',
    });
  });

  it("throws when the track is missing", async () => {
    dbMock.gamePageTrack.findFirst.mockResolvedValueOnce(null);

    await expect(
      buildTrackDownloadBySlug({
        trackSlug: "missing-track",
        pageVersionInput: undefined,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

