import { z } from "zod";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../../infra/coreTenantStore.js";
import {
  buildTrackDownloadFilename,
  createContentDisposition,
  detectAudioFormat,
  embedTrackDownloadMetadata,
  extractMusicFilenameFromUrl,
  getContentTypeForAudioFormat,
  getEmbeddedCoverArt,
  getMusicContentType,
  getMusicFileBuffer,
} from "./audio-download.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { parseTrackPageVersion } from "./page.js";

const SAFE_MUSIC_FILE = /^[A-Za-z0-9._-]+\.(wav|ogg|mp3)$/i;

export const musicFileParamsSchema = z.object({
  filename: z.string().trim().min(1),
});

export const trackDownloadParamsSchema = z.object({
  trackSlug: z.string().trim().min(1),
});

export const trackDownloadQuerySchema = z.object({
  pageVersion: z.unknown().optional(),
});

export async function getMusicFileByName(
  filename: string,
  tenantId?: string | null,
) {
  if (!SAFE_MUSIC_FILE.test(filename)) {
    throw new BadRequestError("Invalid filename");
  }

  const track = await db.gamePageTrack.findFirst({
    where: {
      url: {
        contains: filename,
      },
      gamePage: {
        game: {
          published: true,
        },
      },
    },
    select: {
      gamePage: {
        select: {
          game: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });
  if (!track) {
    throw new NotFoundError("Music not found");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: track.gamePage.game.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Music not found");
  }

  const buffer = await getMusicFileBuffer(filename);
  if (!buffer) {
    throw new NotFoundError("Music not found");
  }

  return {
    buffer,
    contentType: getMusicContentType(filename),
  };
}

export async function buildTrackDownloadBySlug({
  trackSlug,
  pageVersionInput,
  tenantId,
}: {
  trackSlug: string;
  pageVersionInput: unknown;
  tenantId?: string | null;
}) {
  const pageVersion = parseTrackPageVersion(pageVersionInput);
  const track = await db.gamePageTrack.findFirst({
    where: {
      slug: trackSlug,
      gamePage: {
        version: pageVersion,
        game: {
          published: true,
        },
      },
    },
    select: {
      name: true,
      url: true,
      bpm: true,
      musicalKey: true,
      license: true,
      createdAt: true,
      gamePage: {
        select: {
          version: true,
          name: true,
          thumbnail: true,
          banner: true,
          game: {
            select: {
              slug: true,
              published: true,
              id: true,
              jam: {
                select: {
                  startTime: true,
                },
              },
            },
          },
        },
      },
      credits: {
        select: {
          role: true,
          user: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
      tags: {
        select: {
          name: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      },
      composer: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!track || !track.gamePage?.game?.published) {
    throw new NotFoundError("Track not found");
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: track.gamePage.game.id,
    tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    throw new NotFoundError("Track not found");
  }

  const filename = extractMusicFilenameFromUrl(track.url);
  if (!filename) {
    throw new BadRequestError("Invalid track file");
  }

  const originalBuffer = await getMusicFileBuffer(filename);
  if (!originalBuffer) {
    throw new NotFoundError("Music not found");
  }

  const creditedComposer =
    track.credits.find((credit) => credit.role.trim().toLowerCase() === "composer")
      ?.user ?? track.composer;
  const genre = track.tags
    .filter((tag) => tag.category?.name === "Genre")
    .map((tag) => tag.name.trim())
    .filter(Boolean)
    .join("; ");
  const metadataDateSource = track.gamePage.game.jam?.startTime ?? track.createdAt;
  const metadataDate = metadataDateSource.toISOString().slice(0, 10);
  const coverArt = await getEmbeddedCoverArt(
    track.gamePage.thumbnail,
    track.gamePage.banner,
  );
  const albumName = track.gamePage.name ?? track.gamePage.game.slug ?? "Unknown game";
  const metadataBuffer = embedTrackDownloadMetadata(originalBuffer, filename, {
    title: track.name,
    artist: creditedComposer?.name || creditedComposer?.slug || "Unknown composer",
    album: albumName,
    bpm: track.bpm,
    key: track.musicalKey,
    date: metadataDate,
    year: String(metadataDateSource.getUTCFullYear()),
    license: track.license,
    genre: genre || null,
    coverArt,
  });
  const detectedFormat = detectAudioFormat(originalBuffer);
  const downloadFilename = buildTrackDownloadFilename(
    track.name,
    filename,
    detectedFormat,
  );

  return {
    buffer: metadataBuffer,
    contentType: getContentTypeForAudioFormat(detectedFormat, filename),
    contentDisposition: createContentDisposition(downloadFilename),
  };
}

