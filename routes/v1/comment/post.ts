import { Router } from "express";

import authUser from "@middleware/authUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createComment,
  createCommentSchema,
} from "@features/comments";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createCommentSchema);
    await createComment({
      actor: res.locals.user,
      input,
      tenantId: res.locals.tenantId,
    });

    res.send({ message: "Comment created" });
  }),
);

export default router;

