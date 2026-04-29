import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  deleteCommentById,
  deleteCommentSchema,
} from "@features/comments/moderation.service";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.delete(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { commentId, mode } = parseBody(req, deleteCommentSchema);
    const user = requireRequestUser(res);

    const message = await deleteCommentById({
      commentId,
      mode,
      actor: user,
      tenantId: res.locals.tenantId,
    });

    res.send({ message });
  }),
);

export default router;

