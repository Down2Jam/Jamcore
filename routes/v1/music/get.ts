import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync } from "fs";
import mime from "mime-types";
import { GetS3File } from "@helper/s3";
import {
  buildTrackDownloadFilename,
  createContentDisposition,
  detectAudioFormat,
  embedTrackDownloadMetadata,
  getEmbeddedCoverArt,
  extractMusicFilenameFromUrl,
  getContentTypeForAudioFormat,
  getMusicFileBuffer,
} from "@helper/audioDownload";
import db from "@helper/db";
import { parseTrackPageVersion } from "@helper/trackPages";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const SAFE_MUSIC_FILE = /^[A-Za-z0-9._-]+\.(wav|ogg|mp3)$/i;

router.get("/:filename", rateLimit(9999), async (req, res, next) => {
  const { filename } = req.params;
  if (!SAFE_MUSIC_FILE.test(filename)) {
    return res.status(400).send("Invalid filename");
  }
  const musicPath = path.join(
    process.cwd(),
    "public",
    "music",
    filename
  );
  const contentType = mime.lookup(filename) || "application/octet-stream";

  // If we end early (client aborted), don't try to respond again.
  let ended = false;
  const markEnded = () => {
    ended = true;
  };
  res.once("close", markEnded);
  res.once("finish", markEnded);

  try {
    if (existsSync(musicPath)) {
      res.type(contentType);
      res.sendFile(musicPath, (err) => {
        if (err) {
          if (!res.headersSent && !ended) {
            res.status(500).end();
          }
        }
        return;
      });
      return;
    }

    // Not on disk — try S3
    const buffer = await GetS3File("music", filename);

    if (ended) return; // client already left
    if (buffer) {
      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", buffer.length.toString());
      res.send(buffer);
      return;
    }

    if (!res.headersSent && !ended) {
      res.status(404).send("Music not found");
    }
  } catch (err) {
    if (!res.headersSent && !ended) return next(err);
  }
});

router.get("/track/:trackSlug/download", rateLimit(9999), async (req, res, next) => {
  try {
    const { trackSlug } = req.params;
    const pageVersion = parseTrackPageVersion(req.query.pageVersion);
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
      return res.status(404).json({ message: "Track not found" });
    }

    const filename = extractMusicFilenameFromUrl(track.url);
    if (!filename) {
      return res.status(400).json({ message: "Invalid track file" });
    }

    const originalBuffer = await getMusicFileBuffer(filename);
    if (!originalBuffer) {
      return res.status(404).json({ message: "Music not found" });
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

    res.setHeader(
      "Content-Type",
      getContentTypeForAudioFormat(detectedFormat, filename),
    );
    res.setHeader("Content-Length", metadataBuffer.length.toString());
    res.setHeader("Content-Disposition", createContentDisposition(downloadFilename));
    res.send(metadataBuffer);
  } catch (err) {
    return next(err);
  }
});

export default router;
