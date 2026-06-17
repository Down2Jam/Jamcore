import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  assetFilenameParamsSchema,
  getStoredAssetByFilename,
} from "@features/uploads";
import { parseParams } from "@lib/request";
const router = Router();

/**
 * Route to get an image
 */
router.get(
  "/:filename",
  rateLimit(9999),
  asyncHandler(async (req, res) => {
    const { filename } = parseParams(req, assetFilenameParamsSchema);
    const image = await getStoredAssetByFilename({
      folder: "pfps",
      filename,
    });

    if (image.kind === "local") {
      res.sendFile(image.path);
      return;
    }

    res.setHeader("Content-Type", image.contentType);
    res.send(image.buffer);
  }),
);

export default router;
