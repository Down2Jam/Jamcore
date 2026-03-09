import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import { IsUsingS3, UploadS3File } from "./s3";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));

const storage = multer.memoryStorage();

const imageMimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/apng": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const musicMimeToExt: Record<string, string> = {
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
  "audio/mpeg": "mp3",
};

const allowedImageTypes = Object.keys(imageMimeToExt);
const allowedMusicTypes = Object.keys(musicMimeToExt);

function hasMagicBytes(fileBuffer: Buffer, mimeType: string): boolean {
  if (!fileBuffer || fileBuffer.length < 4) return false;

  if (mimeType === "image/jpeg") {
    return (
      fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff
    );
  }

  if (mimeType === "image/png" || mimeType === "image/apng") {
    return (
      fileBuffer.length >= 8 &&
      fileBuffer[0] === 0x89 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x4e &&
      fileBuffer[3] === 0x47 &&
      fileBuffer[4] === 0x0d &&
      fileBuffer[5] === 0x0a &&
      fileBuffer[6] === 0x1a &&
      fileBuffer[7] === 0x0a
    );
  }

  if (mimeType === "image/gif") {
    const header = fileBuffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }

  if (mimeType === "image/webp") {
    const riff = fileBuffer.subarray(0, 4).toString("ascii");
    const webp = fileBuffer.subarray(8, 12).toString("ascii");
    return riff === "RIFF" && webp === "WEBP";
  }

  if (mimeType === "audio/wav") {
    const riff = fileBuffer.subarray(0, 4).toString("ascii");
    const wave = fileBuffer.subarray(8, 12).toString("ascii");
    return riff === "RIFF" && wave === "WAVE";
  }

  if (mimeType === "audio/ogg" || mimeType === "application/ogg") {
    return fileBuffer.subarray(0, 4).toString("ascii") === "OggS";
  }

  if (mimeType === "audio/mpeg") {
    const id3 = fileBuffer.subarray(0, 3).toString("ascii") === "ID3";
    const mpegSync =
      fileBuffer.length >= 2 &&
      fileBuffer[0] === 0xff &&
      (fileBuffer[1] & 0xe0) === 0xe0;
    return id3 || mpegSync;
  }

  return false;
}

function resolveUploadTarget(mimeType: string) {
  if (imageMimeToExt[mimeType]) {
    return {
      folder: "images",
      localFolder: "image",
      extension: imageMimeToExt[mimeType],
    };
  }

  if (musicMimeToExt[mimeType]) {
    return {
      folder: "music",
      localFolder: "music",
      extension: musicMimeToExt[mimeType],
    };
  }

  return null;
}

const uploadHandler = (fileTypes: string[]) =>
  multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 12 }, // 12 MB limit
    fileFilter: (_req, file, cb) => {
      if (!fileTypes.includes(file.mimetype)) {
        const error = new Error("Invalid file type");
        return cb(error);
      }
      cb(null, true);
    },
  });

export const images = uploadHandler(allowedImageTypes);
export const music = uploadHandler(allowedMusicTypes);

type CropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function parseCropRect(body: Record<string, unknown>): CropRect | null {
  const left = Number(body.cropLeft);
  const top = Number(body.cropTop);
  const width = Number(body.cropWidth);
  const height = Number(body.cropHeight);

  if ([left, top, width, height].some((value) => !Number.isFinite(value))) {
    return null;
  }

  const normalized = {
    left: Math.max(0, Math.floor(left)),
    top: Math.max(0, Math.floor(top)),
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  };

  return normalized;
}

async function applyImageCrop(
  fileBuffer: Buffer,
  mimeType: string,
  cropRect: CropRect
) {
  const processor = sharp(fileBuffer, { animated: true, pages: -1 });
  const metadata = await processor.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.pageHeight ?? metadata.height ?? 0;

  if (!width || !height) {
    return { buffer: fileBuffer, mimeType };
  }

  const left = Math.min(cropRect.left, Math.max(0, width - 1));
  const top = Math.min(cropRect.top, Math.max(0, height - 1));
  const extractWidth = Math.max(1, Math.min(cropRect.width, width - left));
  const extractHeight = Math.max(1, Math.min(cropRect.height, height - top));

  let pipeline = sharp(fileBuffer, { animated: true, pages: -1 }).extract({
    left,
    top,
    width: extractWidth,
    height: extractHeight,
  });

  switch (mimeType) {
    case "image/jpeg":
      pipeline = pipeline.jpeg();
      break;
    case "image/png":
    case "image/apng":
      pipeline = pipeline.png();
      mimeType = "image/png";
      break;
    case "image/gif":
      pipeline = pipeline.gif();
      break;
    case "image/webp":
      pipeline = pipeline.webp();
      break;
    default:
      break;
  }

  return {
    buffer: await pipeline.toBuffer(),
    mimeType,
  };
}

export async function UploadFile(req: any, res: any) {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const file = req.file;
  const cropRect =
    file.mimetype in imageMimeToExt
      ? parseCropRect(req.body ?? {})
      : null;
  const processed = cropRect
    ? await applyImageCrop(file.buffer, file.mimetype, cropRect)
    : { buffer: file.buffer, mimeType: file.mimetype };
  const uploadTarget = resolveUploadTarget(processed.mimeType);

  if (!uploadTarget) {
    return res.status(400).json({ message: "Invalid file type" });
  }

  if (!hasMagicBytes(file.buffer, file.mimetype)) {
    return res.status(400).json({ message: "File content does not match type" });
  }

  const fileName = `${uuidv4()}.${uploadTarget.extension}`;
  const folder = uploadTarget.folder;
  const localFolder = uploadTarget.localFolder;

  if (await IsUsingS3()) {
    // Upload to S3
    const success = await UploadS3File(
      folder,
      fileName,
      processed.buffer,
      processed.mimeType
    );
    if (success) {
      return res.json({
        message: "File uploaded",
        data: `${
          process.env.NODE_ENV === "production"
            ? "https://d2jam.com"
            : `http://localhost:${process.env.PORT || 3005}`
        }/api/v1/${localFolder}/${fileName}`,
      });
    } else {
      return res.status(500).json({ message: "S3 upload failed" });
    }
  } else {
    // Save locally
    const localDir = path.resolve(__dirname, "..", "public", folder);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, processed.buffer, { mode: 0o600 });

    return res.json({
      message: "File uploaded",
      data: `${
        process.env.NODE_ENV === "production"
          ? "https://d2jam.com"
          : `http://localhost:${process.env.PORT || 3005}`
      }/api/v1/${localFolder}/${fileName}`,
    });
  }
}

/*
res.status(200).send({
      message: "Image uploaded",
      data: `${
        process.env.NODE_ENV === "production"
          ? "https://d2jam.com"
          : `http://localhost:${process.env.PORT || 3005}`
      }/api/v1/image/${req.file?.filename}`,
    });
*/

/*
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.resolve(__dirname, "..", "public", "images");

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },
  filename: function (req, file, cb) {
    let extArray = file.mimetype.split("/");
    let extension = extArray[extArray.length - 1];
    cb(null, uuidv4() + "." + extension);
  },
});
*/
