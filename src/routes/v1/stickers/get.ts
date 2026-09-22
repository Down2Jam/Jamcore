import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { listStickers } from "@features/emojis";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const stickers = await listStickers(res.locals.tenantId);

    res.json({
      message: "Stickers fetched",
      data: stickers,
    });
  }),
);

export default router;
