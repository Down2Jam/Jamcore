import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createUploadMiddleware,
  handleUploadedFile,
} from "@features/uploads";

const router = Router();

/**
 * Route to upload an image to the server
 * Requires Authentication (to prevent bots)
 */
router.post(
  "/",
  rateLimit(),

  authUser,
  getUser,

  createUploadMiddleware("image"),
  asyncHandler(async (req, res) => {
    await handleUploadedFile(req, res);
  }),
);

export default router;
