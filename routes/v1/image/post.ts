import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import { images, UploadFile } from "@helper/files";

const router = Router();

/**
 * Route to upload an image to the server
 * Requires Authentication (to prevent bots)
 */
router.post(
  "/",
  rateLimit(),

  authUser,

  (req, res, next) => {
    images.single("upload")(req, res, (err) => {
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
