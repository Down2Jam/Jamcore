import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import path from "path";

const router = Router();
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync } from "fs";
import { GetS3File } from "@helper/s3";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Route to get a song
 */
router.get(
  "/:filename",
  rateLimit(9999),

  async (req, res) => {
    const { filename } = req.params;

    const musicPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      "music",
      `${filename}`
    );

    if (existsSync(musicPath)) {
      res.sendFile(musicPath, (err) => {
        if (err) {
          res.status(404).send("Music not found");
        }
      });
      return;
    }

    try {
      const buffer = await GetS3File("music", filename);
      if (buffer) {
        res.send(buffer);
        return;
      }
    } catch (err) {
      console.error("Error getting image from S3:", err);
    }
  }
);

export default router;
