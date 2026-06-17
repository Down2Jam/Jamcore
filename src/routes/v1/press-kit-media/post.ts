import { Router } from "express";

import authUser from "@middleware/authUser";
import assertUserAdmin from "@guards/assertUserAdmin";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createPressKitMedia,
  createPressKitMediaSchema,
} from "@features/content-admin";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "@lib/request";

const router = Router();

router.post(
  "/",
  authUser,
  getUser,
  assertUserAdmin,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createPressKitMediaSchema);
    const user = requireRequestUser(res);
    const media = await createPressKitMedia({
      ...input,
      authorId: user.id,
    });

    res.json({ data: media });
  }),
);

export default router;

