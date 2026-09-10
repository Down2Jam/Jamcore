import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { v4 as uuidv4 } from "uuid";
import yauzl, { type Entry, type ZipFile } from "yauzl";

import { BadRequestError, ServiceUnavailableError } from "../../lib/errors.js";
import { DeleteS3Prefix, IsUsingS3, UploadS3File } from "../../infra/s3.js";
import db from "../../infra/db.js";
import { ForbiddenError } from "../../lib/errors.js";

export const MAX_WEB_BUILD_ARCHIVE_BYTES = 95 * 1000 * 1000;
const MAX_WEB_BUILD_EXPANDED_BYTES = 500 * 1024 * 1024;
const MAX_WEB_BUILD_ENTRY_BYTES = 200 * 1024 * 1024;
const MAX_WEB_BUILD_FILES = 1_000;
const MAX_WEB_BUILD_PATH_LENGTH = 240;
const MAX_USER_WEB_BUILD_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const UNCLAIMED_WEB_BUILD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DETACHED_WEB_BUILD_GRACE_MS = 60 * 60 * 1000;
const MAX_CONCURRENT_WEB_BUILD_JOBS = 2;
let activeWebBuildJobs = 0;

const forbiddenExtensions = new Set([
  ".app", ".bat", ".cmd", ".com", ".dll", ".dmg", ".exe", ".hta",
  ".jar", ".lnk", ".msi", ".php", ".ps1", ".scr", ".sh", ".vbs",
]);

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".bin": "application/octet-stream",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function assetHeaders(filename: string) {
  const lower = filename.toLowerCase();
  const contentEncoding = lower.endsWith(".br")
    ? "br"
    : lower.endsWith(".gz")
      ? "gzip"
      : undefined;
  const typeFilename = contentEncoding ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  return {
    contentEncoding,
    contentType:
      contentTypes[path.extname(typeFilename).toLowerCase()] ??
      "application/octet-stream",
  };
}

function openZip(source: Buffer | string) {
  return new Promise<ZipFile>((resolve, reject) => {
    const callback = (error: Error | null, zip?: ZipFile) => {
      if (error || !zip) reject(error ?? new Error("Invalid ZIP archive"));
      else resolve(zip);
    };
    const options = { lazyEntries: true, validateEntrySizes: true, autoClose: false };
    if (typeof source === "string") yauzl.open(source, options, callback);
    else yauzl.fromBuffer(source, options, callback);
  });
}

function readEntry(zip: ZipFile, entry: Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Could not read ZIP entry"));
        return;
      }
      resolve(Readable.from(stream));
    });
  });
}

function safeEntryPath(name: string) {
  const normalized = name.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new BadRequestError("The ZIP contains an unsafe file path.");
  }
  if (normalized.length > MAX_WEB_BUILD_PATH_LENGTH) {
    throw new BadRequestError("The ZIP contains a file path longer than 240 characters.");
  }
  return normalized;
}

function stripSingleRootFolder(names: string[]) {
  const roots = new Set(names.filter((name) => name.length > 0).map((name) => name.split("/")[0]));
  if (roots.size !== 1) return names;
  const root = [...roots][0];
  if (names.includes("index.html") || names.includes(`${root}/index.html`) === false) return names;
  return names.map((name) => name.slice(root.length + 1));
}

export function validateWebBuildEntries(
  entries: Array<{ fileName: string; uncompressedSize: number }>,
) {
  let expandedBytes = 0;
  if (entries.length > MAX_WEB_BUILD_FILES) {
    throw new BadRequestError("The web build contains too many files.");
  }
  const safeNames = entries.map((entry) => {
    const name = safeEntryPath(entry.fileName);
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
      throw new BadRequestError("The ZIP contains an invalid file size.");
    }
    expandedBytes += entry.uncompressedSize;
    if (expandedBytes > MAX_WEB_BUILD_EXPANDED_BYTES) {
      throw new BadRequestError("The expanded web build is too large.");
    }
    if (entry.uncompressedSize > MAX_WEB_BUILD_ENTRY_BYTES) {
      throw new BadRequestError("A file in the web build is larger than 200 MB.");
    }
    return name;
  });
  const outputNames = stripSingleRootFolder(safeNames);
  if (!outputNames.includes("index.html")) {
    throw new BadRequestError("The web build must contain an index.html file at its root.");
  }
  const seen = new Set<string>();
  for (const name of outputNames) {
    if (!name) continue;
    if (seen.has(name)) {
      throw new BadRequestError("The ZIP contains duplicate file paths.");
    }
    seen.add(name);
    if (forbiddenExtensions.has(path.extname(name).toLowerCase())) {
      throw new BadRequestError(`Web builds cannot contain ${path.extname(name)} files.`);
    }
  }
  return { outputNames, expandedBytes };
}

export function acquireWebBuildProcessingSlot() {
  if (activeWebBuildJobs >= MAX_CONCURRENT_WEB_BUILD_JOBS) {
    throw new ServiceUnavailableError(
      "The web-build processor is busy. Try the upload again shortly.",
    );
  }
  activeWebBuildJobs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeWebBuildJobs -= 1;
  };
}

export async function withWebBuildProcessingSlot<T>(task: () => Promise<T>) {
  const release = acquireWebBuildProcessingSlot();
  try {
    return await task();
  } finally {
    release();
  }
}

export async function storeWebBuildArchive(source: Buffer | string) {
  const header =
    typeof source === "string"
      ? await fs.open(source, "r").then(async (file) => {
          try {
            const bytes = Buffer.alloc(4);
            const { bytesRead } = await file.read(bytes, 0, 4, 0);
            return bytes.subarray(0, bytesRead);
          } finally {
            await file.close();
          }
        })
      : source.subarray(0, 4);
  if (header.length < 4 || header.readUInt32LE(0) !== 0x04034b50) {
    throw new BadRequestError("The uploaded file is not a valid ZIP archive.");
  }

  const zip = await openZip(source).catch(() => {
    throw new BadRequestError("The uploaded file is not a readable ZIP archive.");
  });
  const entries: Entry[] = [];

  await new Promise<void>((resolve, reject) => {
    zip.on("entry", (entry) => {
      try {
        safeEntryPath(entry.fileName);
        entries.push(entry);
        if (entries.length > MAX_WEB_BUILD_FILES) throw new BadRequestError("The web build contains too many files.");
        zip.readEntry();
      } catch (error) {
        zip.close();
        reject(error);
      }
    });
    zip.once("end", resolve);
    zip.once("error", reject);
    zip.readEntry();
  });

  const { outputNames, expandedBytes } = validateWebBuildEntries(entries);

  const buildId = uuidv4();
  const buildRoot = path.resolve(process.cwd(), "public", "game-builds", buildId);
  const usingS3 = Boolean(await IsUsingS3());
  if (!usingS3) await fs.mkdir(buildRoot, { recursive: true, mode: 0o700 });

  try {
    for (let index = 0; index < entries.length; index += 1) {
      const outputName = outputNames[index];
      if (!outputName) continue;
      const destination = path.resolve(buildRoot, outputName);
      if (!destination.startsWith(`${buildRoot}${path.sep}`)) {
        throw new BadRequestError("The ZIP contains an unsafe file path.");
      }
      if (outputName.endsWith("/")) {
        if (!usingS3) await fs.mkdir(destination, { recursive: true, mode: 0o700 });
        continue;
      }
      const file = await readEntry(zip, entries[index]);
      if (usingS3) {
        const headers = assetHeaders(outputName);
        const uploaded = await UploadS3File(
          `game-builds/${buildId}`,
          outputName,
          file,
          headers.contentType,
          entries[index].uncompressedSize,
        );
        if (!uploaded) throw new Error("Web build storage failed.");
      } else {
        await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await pipeline(file, createWriteStream(destination, { mode: 0o600 }));
      }
    }
  } catch (error) {
    if (usingS3) await DeleteS3Prefix(`game-builds/${buildId}/`);
    else await fs.rm(buildRoot, { recursive: true, force: true });
    throw error;
  } finally {
    zip.close();
  }

  return {
    buildId,
    playableUrl: `/game-builds/${buildId}/index.html`,
    expandedBytes,
    fileCount: entries.filter((entry) => !entry.fileName.endsWith("/")).length,
  };
}

export function webBuildIdFromUrl(url?: string | null) {
  return url?.match(/^\/game-builds\/([0-9a-f-]{36})\/index\.html$/i)?.[1] ?? null;
}

export async function deleteStoredWebBuild(buildId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) return;
  if (await IsUsingS3()) {
    await DeleteS3Prefix(`game-builds/${buildId}/`);
    return;
  }
  const buildRoot = path.resolve(process.cwd(), "public", "game-builds", buildId);
  await fs.rm(buildRoot, { recursive: true, force: true });
}

export async function assertWebBuildQuota(ownerId: number, incomingBytes: number) {
  await cleanupExpiredWebBuilds({ ownerId, limit: 20 });
  const totals = await db.webBuild.aggregate({
    where: { ownerId },
    _sum: { archiveBytes: true },
  });
  if ((totals._sum.archiveBytes ?? 0) + incomingBytes > MAX_USER_WEB_BUILD_ARCHIVE_BYTES) {
    throw new BadRequestError("Your stored web builds have reached the 2 GB quota.");
  }
}

export async function registerWebBuild({
  ownerId,
  archiveBytes,
  scanned,
  build,
}: {
  ownerId: number;
  archiveBytes: number;
  scanned: boolean;
  build: Awaited<ReturnType<typeof storeWebBuildArchive>>;
}) {
  await db.$transaction(
    async (tx) => {
      const totals = await tx.webBuild.aggregate({
        where: { ownerId },
        _sum: { archiveBytes: true },
      });
      if ((totals._sum.archiveBytes ?? 0) + archiveBytes > MAX_USER_WEB_BUILD_ARCHIVE_BYTES) {
        throw new BadRequestError("Your stored web builds have reached the 2 GB quota.");
      }
      await tx.webBuild.create({
        data: {
          id: build.buildId,
          ownerId,
          archiveBytes,
          expandedBytes: build.expandedBytes,
          fileCount: build.fileCount,
          scanned,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function assertWebBuildCanAttach(
  url: string | null | undefined,
  actorId: number,
  existingUrls: Array<string | null | undefined> = [],
) {
  if (!url || existingUrls.includes(url)) return;
  const buildId = webBuildIdFromUrl(url);
  if (!buildId) throw new BadRequestError("Invalid playable web build URL.");
  const build = await db.webBuild.findUnique({ where: { id: buildId } });
  if (!build || build.ownerId !== actorId || build.deleteAfter) {
    throw new ForbiddenError("You can only attach web builds that you uploaded.");
  }
}

export async function attachWebBuildToPage(
  pageId: number,
  url?: string | null,
) {
  const buildId = webBuildIdFromUrl(url);
  if (!buildId) {
    await db.gamePage.update({
      where: { id: pageId },
      data: { playableBuild: { disconnect: true } },
    });
    return;
  }

  await db.$transaction(async (tx) => {
    const claimed = await tx.webBuild.updateMany({
      where: { id: buildId, deleteAfter: null },
      data: { claimedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new BadRequestError(
        "That playable web build is no longer available. Upload it again.",
      );
    }
    await tx.gamePage.update({
      where: { id: pageId },
      data: { playableBuild: { connect: { id: buildId } } },
    });
  });
}

export async function scheduleWebBuildDeletionIfUnreferenced(
  buildId?: string | null,
) {
  if (!buildId) return;
  await db.webBuild.updateMany({
    where: { id: buildId, gamePages: { none: {} } },
    data: { deleteAfter: new Date(Date.now() + DETACHED_WEB_BUILD_GRACE_MS) },
  });
}

export async function cleanupExpiredWebBuilds({
  ownerId,
  limit = 50,
}: { ownerId?: number; limit?: number } = {}) {
  const now = new Date();
  await db.webBuild.updateMany({
    where: {
      ...(ownerId == null ? {} : { ownerId }),
      claimedAt: null,
      deleteAfter: null,
      createdAt: {
        lt: new Date(now.getTime() - UNCLAIMED_WEB_BUILD_MAX_AGE_MS),
      },
      gamePages: { none: {} },
    },
    data: { deleteAfter: now },
  });

  const expired = await db.webBuild.findMany({
    where: {
      ...(ownerId == null ? {} : { ownerId }),
      deleteAfter: { lte: now },
      gamePages: { none: {} },
    },
    select: { id: true },
    orderBy: { deleteAfter: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
  });

  let deleted = 0;
  for (const build of expired) {
    await deleteStoredWebBuild(build.id);
    const result = await db.webBuild.deleteMany({
      where: {
        id: build.id,
        deleteAfter: { lte: now },
        gamePages: { none: {} },
      },
    });
    deleted += result.count;
  }
  return deleted;
}

export function resolveWebBuildAsset(buildId: string, requestedPath: string) {
  if (!/^[0-9a-f-]{36}$/i.test(buildId)) return null;
  const buildRoot = path.resolve(process.cwd(), "public", "game-builds", buildId);
  const relativePath = safeEntryPath(requestedPath || "index.html");
  const assetPath = path.resolve(buildRoot, relativePath);
  if (!assetPath.startsWith(`${buildRoot}${path.sep}`)) return null;
  return {
    path: assetPath,
    storageFolder: `game-builds/${buildId}`,
    storageName: relativePath,
    ...assetHeaders(assetPath),
  };
}
