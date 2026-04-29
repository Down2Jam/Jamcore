import express from "express";

import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createTrackRatingSchema,
  saveTrackRating,
} from "@features/ratings";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = express.Router();

router.post(
  "/",
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createTrackRatingSchema);
    const user = requireRequestUser(res);
    await saveTrackRating({
      trackId: input.trackId,
      categoryId: input.categoryId,
      value: input.value,
      userId: user.id,
      tenantId: res.locals.tenantId,
    });

    return res.json({ message: "Track rating saved" });
  }),
);

export default router;

