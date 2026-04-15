import { Router } from "express";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { promises as fs } from "fs";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import db from "@helper/db";
import { IsUsingS3 } from "@helper/s3";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const STALE_DAYS = 7;

const extractFilename = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/\/api\/v1\/image\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  return null;
};

const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;

router.get(
  "/",
  rateLimit(20),
  authUser,
  getUser,
  async (_req, res) => {
    if (!res.locals.user?.admin) {
      res.status(403).send({ message: "Admin only." });
      return;
    }

    const usingS3 = await IsUsingS3();

    const imageDir = path.resolve(
      process.cwd(),
      "public",
      "images"
    );

    const usage = new Map<string, number>();
    const track = (value?: string | null) => {
      const filename = extractFilename(value);
      if (!filename) return;
      usage.set(filename, (usage.get(filename) ?? 0) + 1);
    };

    const trackAll = (values: Array<string | null | undefined>) => {
      for (const value of values) track(value);
    };

    const [
      users,
      gamePages,
      achievements,
      reactions,
      events,
      tags,
      flags,
      jams,
      roles,
      streamers,
    ] = await Promise.all([
      db.user.findMany({
        select: {
          profilePicture: true,
          bannerPicture: true,
          profileBackground: true,
        },
      }),
      db.gamePage.findMany({
        select: {
          thumbnail: true,
          banner: true,
          screenshots: true,
        },
      }),
      db.gamePageAchievement.findMany({ select: { image: true } }),
      db.reaction.findMany({ select: { image: true } }),
      db.event.findMany({ select: { icon: true } }),
      db.tag.findMany({ select: { icon: true } }),
      db.flag.findMany({ select: { icon: true } }),
      db.jam.findMany({ select: { icon: true } }),
      db.teamRole.findMany({ select: { icon: true } }),
      db.featuredStreamer.findMany({ select: { thumbnailUrl: true } }),
    ]);

    users.forEach((user) =>
      trackAll([
        user.profilePicture,
        user.bannerPicture,
        user.profileBackground,
      ])
    );
    gamePages.forEach((page) => {
      trackAll([page.thumbnail, page.banner]);
      if (Array.isArray(page.screenshots)) {
        trackAll(page.screenshots);
      }
    });
    achievements.forEach((ach) => track(ach.image));
    reactions.forEach((reaction) => track(reaction.image));
    events.forEach((event) => track(event.icon));
    tags.forEach((tag) => track(tag.icon));
    flags.forEach((flag) => track(flag.icon));
    jams.forEach((jam) => track(jam.icon));
    roles.forEach((role) => track(role.icon));
    streamers.forEach((streamer) => track(streamer.thumbnailUrl));

    let files: string[] = [];
    try {
      files = await fs.readdir(imageDir);
    } catch (error) {
      if (!usingS3) {
        res.status(500).send({ message: "Failed to read image directory." });
        return;
      }
    }
    const now = Date.now();
    let totalSize = 0;
    let deletedCount = 0;
    let deletedSize = 0;

    const entries = await Promise.all(
      files.map(async (file) => {
        const fullPath = path.join(imageDir, file);
        const stat = await fs.stat(fullPath);
        const usageCount = usage.get(file) ?? 0;
        const stale =
          usageCount === 0 && now - stat.mtimeMs > daysToMs(STALE_DAYS);

        if (stale) {
          await fs.unlink(fullPath);
          deletedCount += 1;
          deletedSize += stat.size;
          return null;
        }

        totalSize += stat.size;

        return {
          name: file,
          url: `/api/v1/image/${file}`,
          size: stat.size,
          usageCount,
          lastModified: stat.mtime.toISOString(),
        };
      })
    );

    const filtered = entries.filter((entry) => entry !== null);

    res.status(200).send({
      message: "Images fetched",
      data: {
        totalFiles: filtered.length,
        totalSize,
        deletedCount,
        deletedSize,
        files: filtered,
        source: usingS3 ? "local-only" : "local",
      },
    });
  }
);

export default router;
