import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import { music, UploadFile } from "@helper/files";

const router = Router();

/**
 * Route to upload a song to the server
 * Requires Authentication (to prevent bots)
 */
router.post(
  "/",
  rateLimit(),

  authUser,

  (req, res, next) => {
    music.single("upload")(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(500).send({ message: "File upload error" });
      }
      next();
    });
  },

  async (req, res) => {
    try {
      await UploadFile(req, res);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).send({ message: "File upload error" });
    }
  }
);

export default router;
