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
      "pfps",
      `${filename}`
    );

    console.log(imagePath);

    if (existsSync(imagePath)) {
      res.sendFile(imagePath, (err) => {
        if (err) {
          res.status(404).send("Image not found");
        }
      });
      return;
    }

    res.status(404).send("Image not found");
  }
);

export default router;
