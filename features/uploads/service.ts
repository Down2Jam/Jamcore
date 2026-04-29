import { existsSync } from "fs";
import type { RequestHandler } from "express";
import mime from "mime-types";
import path from "path";
import process from "process";
import { z } from "zod";

import { UploadFile, images, music } from "./upload-internal.js";
import { GetS3File } from "../../infra/s3.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const SAFE_FILENAME = /^[A-Za-z0-9._-]+\.(png|jpe?g|gif|webp)$/i;

export const assetFilenameParamsSchema = z.object({
  filename: z.string().trim().regex(SAFE_FILENAME, "Invalid filename"),
});

type AssetFolder = "images" | "pfps";
type UploadKind = "image" | "music";

type StoredAsset =
  | {
      kind: "local";
      path: string;
    }
  | {
      kind: "buffer";
      buffer: Buffer;
      contentType: string;
    };

function getUploadHandler(kind: UploadKind) {
  return kind === "image" ? images : music;
}

export function createUploadMiddleware(kind: UploadKind): RequestHandler {
  const uploader = getUploadHandler(kind);

  return (req, res, next) => {
    uploader.single("upload")(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      if (err.code === "LIMIT_FILE_SIZE" || err.message === "Invalid file type") {
        next(new BadRequestError("Invalid upload"));
        return;
      }

      next(err);
    });
  };
}

export async function handleUploadedFile(req: Parameters<typeof UploadFile>[0], res: Parameters<typeof UploadFile>[1]) {
  await UploadFile(req, res);
}

export async function getStoredAssetByFilename({
  folder,
  filename,
}: {
  folder: AssetFolder;
  filename: string;
}): Promise<StoredAsset> {
  const assetPath = path.join(process.cwd(), "public", folder, filename);

  if (existsSync(assetPath)) {
    return {
      kind: "local",
      path: assetPath,
    };
  }

  const fileBuffer = await GetS3File(folder, filename);
  if (fileBuffer) {
    return {
      kind: "buffer",
      buffer: fileBuffer,
      contentType: mime.lookup(filename) || "application/octet-stream",
    };
  }

  throw new NotFoundError("Image not found");
}

