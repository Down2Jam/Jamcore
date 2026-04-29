import { Router } from "express";

import authUser from "@middleware/authUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  updateComment,
  updateCommentSchema,
} from "@features/comments";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.put(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, updateCommentSchema);
    const updated = await updateComment({
      actor: res.locals.user,
      input,
      tenantId: res.locals.tenantId,
    });

    res.send({ message: "Comment updated", data: updated });
  }),
);

export default router;

