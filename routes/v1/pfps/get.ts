import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import path from "path";

const router = Router();
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync, readdir } from "fs";
import { GetS3File } from "@helper/s3";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Route to get all pfps
 */
router.get(
  "/",
  rateLimit(),

  (_req, res) => {
    const dir = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      "images",
      "pfps"
    );

    readdir(dir, (err, files) => {
      if (err) return res.status(500).json({ message: "Failed to read pfps" });

      const imageUrls = files
        .filter((f) => /\.(png|jpe?g|gif|webp|svg)$/.test(f))
        .map(
          (file) =>
            `${
              process.env.NODE_ENV === "production"
                ? "https://d2jam.com"
                : `http://localhost:${process.env.PORT || 3005}`
            }/api/v1/image/pfp/${file}`
        );

      res.json({ message: "fetched pfps", data: imageUrls });
    });
  }
);

export default router;
