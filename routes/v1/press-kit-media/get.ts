import { Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { listPressKitMedia } from "@features/content-admin";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const media = await listPressKitMedia();

    res.json({ data: media });
  }),
);

export default router;
