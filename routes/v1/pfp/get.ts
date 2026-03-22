import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import path from "path";
import process from "process";

const router = Router();
import { existsSync } from "fs";
import { GetS3File } from "@helper/s3";
import mime from "mime-types";
const SAFE_PFP_FILE = /^[A-Za-z0-9._-]+\.(png|jpe?g|gif|webp)$/i;

/**
 * Route to get an image
 */
router.get(
  "/:filename",
  rateLimit(9999),

  async (req, res) => {
    const { filename } = req.params;
    if (!SAFE_PFP_FILE.test(filename)) {
      return res.status(400).send("Invalid filename");
    }

    const imagePath = path.join(
      process.cwd(),
      "public",
      "pfps",
      `${filename}`
    );

    if (existsSync(imagePath)) {
      res.sendFile(imagePath, (err) => {
        if (err) {
          res.status(404).send("Image not found");
        }
      });
      return;
    }

    try {
      const imageBuffer = await GetS3File("pfps", filename);
      if (imageBuffer) {
        const contentType = mime.lookup(filename) || "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        return res.send(imageBuffer);
      }
    } catch (err) {
      console.error("Error getting pfp from S3:", err);
    }

    return res.status(404).send("Image not found");
  }
);

export default router;
