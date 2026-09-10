import path from "path";
import { promises as fs } from "fs";

import db from "../../infra/db.js";
import { IsUsingS3 } from "../../infra/s3.js";

const STALE_DAYS = 7;

const extractFilename = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/\/api\/v1\/image\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  return null;
};

const extractFilenames = (value?: string | null) => {
  if (!value) return [];
  return Array.from(
    value.matchAll(/\/api\/v1\/image\/([^/?#)"'\s<>]+)/gi),
    (match) => match[1],
  );
};

const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;

export async function listAdminImages() {
  const usingS3 = await IsUsingS3();
  const imageDir = path.resolve(process.cwd(), "public", "images");

  const usage = new Map<string, number>();
  const track = (value?: string | null) => {
    const filename = extractFilename(value);
    if (!filename) return;
    usage.set(filename, (usage.get(filename) ?? 0) + 1);
  };

  const trackAll = (values: Array<string | null | undefined>) => {
    for (const value of values) track(value);
  };

  const trackEmbedded = (value?: string | null) => {
    for (const filename of extractFilenames(value)) {
      usage.set(filename, (usage.get(filename) ?? 0) + 1);
    }
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
    posts,
    comments,
    documents,
    trackCommentary,
    collectionComments,
    collections,
    postRevisions,
    postAutosaves,
  ] = await Promise.all([
    db.user.findMany({
      select: {
        profilePicture: true,
        bannerPicture: true,
        profileBackground: true,
        bio: true,
      },
    }),
    db.gamePage.findMany({
      select: {
        thumbnail: true,
        soundtrackThumbnail: true,
        banner: true,
        screenshots: true,
        description: true,
      },
    }),
    db.gamePageAchievement.findMany({ select: { image: true } }),
    db.reaction.findMany({ select: { image: true } }),
    db.event.findMany({ select: { icon: true, content: true } }),
    db.tag.findMany({ select: { icon: true } }),
    db.flag.findMany({ select: { icon: true } }),
    db.jam.findMany({ select: { icon: true } }),
    db.teamRole.findMany({ select: { icon: true } }),
    db.featuredStreamer.findMany({ select: { thumbnailUrl: true } }),
    db.post.findMany({ select: { content: true } }),
    db.comment.findMany({ select: { content: true } }),
    db.documentationDocument.findMany({ select: { content: true } }),
    db.gamePageTrack.findMany({ select: { commentary: true } }),
    db.collectionComment.findMany({ select: { content: true } }),
    db.collection.findMany({ select: { description: true } }),
    db.postRevision.findMany({ select: { content: true } }),
    db.postAutosave.findMany({ select: { content: true } }),
  ]);

  users.forEach((user) =>
    trackAll([user.profilePicture, user.bannerPicture, user.profileBackground]),
  );
  gamePages.forEach((page) => {
    trackAll([page.thumbnail, page.soundtrackThumbnail, page.banner]);
    if (Array.isArray(page.screenshots)) {
      trackAll(page.screenshots);
    }
  });
  achievements.forEach((achievement) => track(achievement.image));
  reactions.forEach((reaction) => track(reaction.image));
  events.forEach((event) => track(event.icon));
  tags.forEach((tag) => track(tag.icon));
  flags.forEach((flag) => track(flag.icon));
  jams.forEach((jam) => track(jam.icon));
  roles.forEach((role) => track(role.icon));
  streamers.forEach((streamer) => track(streamer.thumbnailUrl));
  users.forEach((user) => trackEmbedded(user.bio));
  gamePages.forEach((page) => trackEmbedded(page.description));
  posts.forEach((post) => trackEmbedded(post.content));
  comments.forEach((comment) => trackEmbedded(comment.content));
  documents.forEach((document) => trackEmbedded(document.content));
  events.forEach((event) => trackEmbedded(event.content));
  trackCommentary.forEach((track) => trackEmbedded(track.commentary));
  collectionComments.forEach((comment) => trackEmbedded(comment.content));
  collections.forEach((collection) => trackEmbedded(collection.description));
  postRevisions.forEach((revision) => trackEmbedded(revision.content));
  postAutosaves.forEach((autosave) => trackEmbedded(autosave.content));

  let files: string[] = [];
  try {
    files = await fs.readdir(imageDir);
  } catch {
    if (!usingS3) {
      throw new Error("Failed to read image directory.");
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
      const stale = usageCount === 0 && now - stat.mtimeMs > daysToMs(STALE_DAYS);

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
    }),
  );

  const filtered = entries.filter((entry) => entry !== null);

  return {
    totalFiles: filtered.length,
    totalSize,
    deletedCount,
    deletedSize,
    files: filtered,
    source: usingS3 ? "local-only" : "local",
  };
}

