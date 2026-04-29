import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listTrackTags } from "@features/taxonomies";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const tags = await listTrackTags();

    res.send({
      message: "Track tags fetched",
      data: tags,
    });
  }),
);

export default router;
