import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import { IsUsingS3, UploadS3File } from "./s3";

const __dirname = dirname(fileURLToPath(import.meta.url));

const storage = multer.memoryStorage();

const images = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 8 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg", // JPEG images
      "image/png", // PNG images
      "image/apng", // APNG images
      "image/gif", // GIF images
      "image/webp", // WebP images
      "image/svg+xml", // SVG images
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error("Invalid file type");
      return cb(error);
    }

    cb(null, true);
  },
});

export async function UploadImage(req: any, res: any) {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const file = req.file;
  const fileName = uuidv4() + path.extname(file.originalname);
  const folder = "images";

  if (await IsUsingS3()) {
    // Upload to S3
    const success = await UploadS3File(
      folder,
      fileName,
      file.buffer,
      file.mimetype
    );
    if (success) {
      return res.json({
        message: "Image uploaded",
        data: `${
          process.env.NODE_ENV === "production"
            ? "https://d2jam.com"
            : `http://localhost:${process.env.PORT || 3005}`
        }/api/v1/image/${fileName}`,
      });
    } else {
      return res.status(500).json({ message: "S3 upload failed" });
    }
  } else {
    // Save locally
    const localDir = path.resolve(__dirname, "..", "public", "images");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, file.buffer);

    return res.json({
      message: "Image uploaded",
      data: `${
        process.env.NODE_ENV === "production"
          ? "https://d2jam.com"
          : `http://localhost:${process.env.PORT || 3005}`
      }/api/v1/image/${fileName}`,
    });
  }
}

export default images;

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
