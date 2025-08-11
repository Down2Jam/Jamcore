import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync } from "fs";
import mime from "mime-types";
import { GetS3File } from "@helper/s3";

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

router.get("/:filename", rateLimit(9999), async (req, res, next) => {
  const { filename } = req.params;
  const musicPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    "music",
    filename
  );
  const contentType = mime.lookup(filename) || "application/octet-stream";

  // If we end early (client aborted), don't try to respond again.
  let ended = false;
  const markEnded = () => {
    ended = true;
  };
  res.once("close", markEnded);
  res.once("finish", markEnded);

  try {
    if (existsSync(musicPath)) {
      res.type(contentType);
      res.sendFile(musicPath, (err) => {
        if (err) {
          if (!res.headersSent && !ended) {
            res.status(500).end();
          }
        }
        return;
      });
      return;
    }

    // Not on disk — try S3
    const buffer = await GetS3File("music", filename);

    if (ended) return; // client already left
    if (buffer) {
      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", buffer.length.toString());
      res.send(buffer);
      return;
    }

    if (!res.headersSent && !ended) {
      res.status(404).send("Music not found");
    }
  } catch (err) {
    if (!res.headersSent && !ended) return next(err);
  }
});

export default router;
