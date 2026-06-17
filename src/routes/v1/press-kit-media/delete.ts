import { Router } from "express";

import authUser from "@middleware/authUser";
import assertUserAdmin from "@guards/assertUserAdmin";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  deletePressKitMedia,
  deletePressKitMediaSchema,
} from "@features/content-admin";
import { parseBody } from "@lib/request";

const router = Router();

router.delete(
  "/",
  authUser,
  getUser,
  assertUserAdmin,
  asyncHandler(async (req, res) => {
    const { mediaId } = parseBody(req, deletePressKitMediaSchema);
    await deletePressKitMedia(mediaId);

    res.json({ message: "Media deleted" });
  }),
);

export default router;

