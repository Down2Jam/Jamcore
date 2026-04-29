import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { listEmojis } from "@features/emojis";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const emojis = await listEmojis(res.locals.tenantId);

    res.json({
      message: "Emojis fetched",
      data: emojis,
    });
  }),
);

export default router;
