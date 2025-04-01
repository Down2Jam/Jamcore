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
 * Route to get an image
 */
router.get(
  "/:filename",
  rateLimit(9999),

  async (req, res) => {
    const { filename } = req.params;

    const imagePath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      "images",
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
      const imageBuffer = await GetS3File("images", filename);
      if (imageBuffer) {
        // Set the correct content type (assuming JPEG for this example)
        res.setHeader("Content-Type", "image/jpeg");
        res.send(imageBuffer);
        return;
      }
    } catch (err) {
      console.error("Error getting image from S3:", err);
    }
  }
);

export default router;
