import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listTrackFlags } from "@features/taxonomies";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const flags = await listTrackFlags();

    res.send({
      message: "Track flags fetched",
      data: flags,
    });
  }),
);

export default router;
