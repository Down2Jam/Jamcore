import express from "express";

import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createTrackTimestampComment,
  createTrackTimestampCommentSchema,
} from "@features/ratings";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = express.Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createTrackTimestampCommentSchema);
    const user = requireRequestUser(res);
    const created = await createTrackTimestampComment({
      trackId: input.trackId,
      content: input.content,
      timestamp: input.timestamp,
      authorId: user.id,
      tenantId: res.locals.tenantId,
    });

    return res.status(201).json({
      message: "Timestamp comment created",
      data: created,
    });
  }),
);

export default router;

