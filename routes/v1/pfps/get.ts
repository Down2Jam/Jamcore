import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import path from "path";
import process from "process";

const router = Router();
import { readdir } from "fs";

/**
 * Route to get all pfps
 */
router.get(
  "/",
  rateLimit(),

  (_req, res) => {
    const dir = path.join(process.cwd(), "public", "pfps");

    readdir(dir, (err, files) => {
      if (err) return res.status(500).json({ message: "Failed to read pfps" });

      const imageUrls = files
        .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
        .map(
          (file) =>
            `${
              process.env.NODE_ENV === "production"
                ? "https://d2jam.com"
                : `http://localhost:${process.env.PORT || 3005}`
            }/api/v1/pfp/${file}`
        );

      res.json({ message: "fetched pfps", data: imageUrls });
    });
  }
);

export default router;
